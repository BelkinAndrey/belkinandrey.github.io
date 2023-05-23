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
    levelMin: 0.0,
    levelLeak: 1.0,
    refractoryPeriod: 0,
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
var linkStart;
var spikes;
var linkEnd;
var MaxInputLink = 0;
var NeuronInpIndex;

const gpu = new GPU();
var kernelFireNode;
var kernelLinkStart;
var kernelSpikes;
var kernelLinkEnd;
var kernelActionNode;


function initialization() {
    fireNode = Array.from({ length: space.nodes.length }, () => Array(2).fill(0));
    
    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];

    linksData = Array.from({ length: space.links.length}, () => Array(4).fill(0));
    linksData.forEach((item, index) => {
        item[0] = space.nodes.findIndex(node => node.id === space.links[index].from);
        item[1] = space.nodes.findIndex(node => node.id === space.links[index].to);
        item[2] = space.links[index].setting.delay;
        item[3] = space.links[index].type;
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
        if (res1 > 0) res2 = linkstart[this.thread.x][1] + 1;
        if (res2 > 31) res2 = 0;
        return [res1, res2];
    }).setOutput([linksData.length]);

    kernelSpikes = gpu.createKernel(function(spikes, linkStart, links){
        let res = spikes[this.thread.y][this.thread.x];
        if (res == -2) res = -1;
        if (res >= 0) res++;
        if (res > links[this.thread.y][2]) res = -2;
        if (linkStart[this.thread.y][0] == 1) {
           if (linkStart[this.thread.y][1] == this.thread.x) res = 0 
        }; 
        return res;
    }).setOutput([32, space.links.length]);

    kernelLinkEnd = gpu.createKernel(function(spikes){
        let res = 0;
        for (let i = 0; i < 32; i++) {
            if (spikes[this.thread.x][i] == -2) res = 1;
        };
        return res;
    }).setOutput([linksData.length]);

    kernelActionNode = gpu.createKernel(function(InpIndex, linkEnd, node){
        let res1 = node[this.thread.x][0];
        let res2 = node[this.thread.x][1];

        for (let i = 0; i < this.constants.max; i++){
            const index = InpIndex[this.thread.x][i];
            if  (index !== -1)  {
                if (linkEnd[index] == 1) {
                    res1 = 1;
                    res2 = 100;
                }
            };
        };
        return [res1, res2];
    }).setOutput([fireNode.length]).setConstants({ max: MaxInputLink });

    kernelFireNode = gpu.createKernel(function(node) {
        let res = 0;
        if (node[this.thread.x][1] > 0) res = node[this.thread.x][1] - 1;
        return [0, res];
    }).setOutput([fireNode.length]);



    /////////////////////END GPU////////////////////////
    
}



function tact() {

    linkStart = kernelLinkStart(linksData, fireNode, linkStart);
    spikes = kernelSpikes(spikes, linkStart, linksData);
    linkEnd = kernelLinkEnd(spikes);
    fireNode = kernelFireNode(fireNode);
    fireNode = kernelActionNode(NeuronInpIndex, linkEnd, fireNode);

    
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
    if (fireNode[arrSensor[1][index]][1] < 50) {
        fireNode[arrSensor[1][index]][1] = 100;
        fireNode[arrSensor[1][index]][0] = 1;
    }; 
};