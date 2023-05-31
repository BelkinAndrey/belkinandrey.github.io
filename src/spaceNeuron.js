var playing = false;

var intervalID;

var space = {
    nodes: [],
    links: [],
};

const NeuronDefault = {
    threshold: 10.0,
    thresholdMax: 100.0,
    thresholdMin: 0.0,
    levelMax: 200.0,
    levelMin: -200.0,
    levelLeak: 1.0,
    refractoryPeriod: 5,
    modulationLeak: 0.1,
};

const ActuatorDefault = {
    id: '',
};

const SensorDefault = {
    key: '',
    id: '',
};

const ModuleDefault = {};

const LinkDefault = {
    direct: {
        weight: 10.0,
        delay: 0,
    },
    modulating: {
        weight: 10.0,
        delay: 0,
    },
    electrical: {
        delay: 0,
    },
    hebb: {
        weight: 10.0,
        weightMax: 100.0,
        weightMin: -100.0,
        delay: 0,
        timeBefore: 1,
        timeAfter: 1,
        weightUp: 0.1, 
        weightDown: 0.001,
        plasticity: 1.0,
        memoryTime: 1000000.0
    }
};

var linkType = 1;
var nodeType = 1;
var linkSetting = LinkDefault.direct;
var NodeSetting = NeuronDefault;

var fireNode = [];
var arrSensor = [];
var linksData = [];
var neuronData = [];
var linkStart;
var spikes;
var linkEnd;
var MaxInputLink = 0;
var NeuronInpIndex;


//const gpu = new GPU();
const gpu = new GPUX();
var kernelFireNode;
var kernelLinkStart;
var kernelSpikes;
var kernelLinkEnd;
var kernelActionNode;




function initialization() {
    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];

    linksData = Array.from({ length: space.links.length}, () => Array(5).fill(0));
    linksData.forEach((item, index) => {
        item[0] = space.nodes.findIndex(node => node.id === space.links[index].from);
        item[1] = space.nodes.findIndex(node => node.id === space.links[index].to);
        item[2] = space.links[index].setting.delay;
        item[3] = space.links[index].type;
        item[4] = item[3] == 3 ? 1 : space.links[index].setting.weight;
    });

    neuronData = Array.from({length: space.nodes.length}, () => Array(9).fill(0));
    neuronData.forEach((item, index) => {
        item[0] = space.nodes[index].type;
        item[1] = item[0] == 1 ? space.nodes[index].setting.threshold : 0;
        item[2] = item[0] == 1 ? space.nodes[index].setting.thresholdMax : 0;
        item[3] = item[0] == 1 ? space.nodes[index].setting.thresholdMin : 0;
        item[4] = item[0] == 1 ? space.nodes[index].setting.levelMax : 0;
        item[5] = item[0] == 1 ? space.nodes[index].setting.levelMin : 0;
        item[6] = item[0] == 1 ? space.nodes[index].setting.levelLeak : 0;
        item[7] = item[0] == 1 ? space.nodes[index].setting.refractoryPeriod : 0;
        item[8] = item[0] == 1 ? space.nodes[index].setting.modulationLeak : 0;
    });

    fireNode = Array.from({ length: space.nodes.length }, () => Array(4).fill(0));
    fireNode.forEach((item, index) => {
        item[0] = 0;                    //Fire/postFire
        item[1] = 0;                    //Level
        item[2] = neuronData[index][1]; //start threshold
        item[3] = 0;                    //refractoryPeriod
    });


    linkStart = Array.from({ length: space.links.length}, () => Array(2).fill(0));
    spikes = Array.from({length: space.links.length}, () => Array(32).fill(-1));

    const counts = {};
    for (let i = 0; i < linksData.length; i++) {
        const el = space.links[i].to;
        counts[el] = (counts[el] || 0) + 1;
    }
    MaxInputLink = Math.max(...Object.values(counts));

    NeuronInpIndex = Array.from({ length: space.nodes.length }, () => Array(MaxInputLink).fill(-1));

    linksData.forEach((element, index) => {
        let n = 0;
        while (NeuronInpIndex[element[1]][n] != -1) {
            n++;
            if (n > MaxInputLink) break;
        }; 
        if (n < MaxInputLink) NeuronInpIndex[element[1]][n] = index; 
    });



    //////////////////////GPU///////////////////////////
    kernelLinkStart = gpu.createKernel(function(link, node, linkstart) {
        let index = link[this.thread.x][0];
        let res1 = node[index][0]; 
        let res2 = linkstart[this.thread.x][1];
        if (res1 == 100) res2++;
        if (res2 > 31) res2 = 0;
        return [res1, res2];
    }).setOutput([linksData.length]);

    kernelSpikes = gpu.createKernel(function(spikes, linkStart, links){
        let res = spikes[this.thread.y][this.thread.x];
        if (res == -2) res = -1;
        if (res >= 0) res++;
        if (res > links[this.thread.y][2]) res = -2;
        if ((linkStart[this.thread.y][0] == 100) && (res == -1)) {
           if (linkStart[this.thread.y][1] == this.thread.x) res = 0 
        }; 
        return res;
    }).setOutput([32, space.links.length]);

    kernelLinkEnd = gpu.createKernel(function(spikes, linksData){
        let res1 = 0;
        let res2 = 0;
        let res3 = 0;
        for (let i = 0; i < 32; i++) {
            if (spikes[this.thread.x][i] == -2) {
                if ((linksData[this.thread.x][3] == 1) || (linksData[this.thread.x][3] == 4)) res1 += linksData[this.thread.x][4];
                if (linksData[this.thread.x][3] == 2) res2 += linksData[this.thread.x][4];
                if (linksData[this.thread.x][3] == 3) res3 = 1;
            };
        };
        return [res1, res2, res3];
    }).setOutput([linksData.length]);

    kernelActionNode = gpu.createKernel(function(InpIndex, linkEnd, fireNode, neuronData){
        let res0 = fireNode[this.thread.x][0];
        let res1 = fireNode[this.thread.x][1];
        let res2 = fireNode[this.thread.x][2];
        let res3 = fireNode[this.thread.x][3];


        let dir = 0;
        let mod = 0;
        let ele = 0;

        for (let i = 0; i < this.constants.max; i++){
            const index = InpIndex[this.thread.x][i];
            if  (index !== -1)  {
                dir += linkEnd[index][0];
                mod += linkEnd[index][1];
                if (linkEnd[index][2] == 1) ele = 1;
            };
        };

        res1 += dir;
        res1 = Math.max(Math.min(res1, neuronData[this.thread.x][4]), neuronData[this.thread.x][5]);

        res2 += mod;
        res2 = Math.max(Math.min(res2, neuronData[this.thread.x][2]), neuronData[this.thread.x][3]);

        if (res3 == 0) {
            if ((res1 > res2) || (ele == 1)) {
                res0 = 100;
                res3 = neuronData[this.thread.x][7];
            }
        };

        return [res0, res1, res2, res3];
    }).setOutput([fireNode.length]).setConstants({ max: MaxInputLink });

    kernelFireNode = gpu.createKernel(function(node, neuronData) {
        let res0 = node[this.thread.x][0];
        let res1 = node[this.thread.x][1];
        let res2 = node[this.thread.x][2];
        let res3 = node[this.thread.x][3];

        if (res0 > 0) res0--;

        const leak = neuronData[this.thread.x][6];
        if (res1 > 0) {
            res1 -= leak;
            if (res1 < 0) res1 = 0;
        } else {
            res1 += leak;
            if (res1 > 0) res1 = 0;
        };

        const tleak = neuronData[this.thread.x][8];
        const thtre = neuronData[this.thread.x][1];
        if (res2 > thtre) {
            res2 -= tleak;
            if (res2 < thtre) res2 = thtre;
        } else {
            res2 += tleak;
            if (res2 > thtre) res2 = thtre;
        };

        if (res3 > 0) res3--;

        return [res0, res1, res2, res3];
    }).setOutput([fireNode.length]);


    /////////////////////END GPU////////////////////////
    
}



function tact() {

    linkStart = kernelLinkStart(linksData, fireNode, linkStart);
    spikes = kernelSpikes(spikes, linkStart, linksData);
    linkEnd = kernelLinkEnd(spikes, linksData);
    fireNode = kernelFireNode(fireNode, neuronData);
    fireNode = kernelActionNode(NeuronInpIndex, linkEnd, fireNode, neuronData);
    
};


function StartSpace() {
    playing = true;
    initialization();
    intervalID = setInterval(tact, 1);  
};

function StopSpace() {
    playing = false;
    clearInterval(intervalID);
    arrSensor = [];
    spikes = [];
};

function FireSensor(index) {
    if (fireNode[arrSensor[1][index]][0] < 50) {
        fireNode[arrSensor[1][index]][0] = 100;
    }; 
};