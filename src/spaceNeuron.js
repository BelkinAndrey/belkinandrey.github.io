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

const gpu = new GPU();
var kernelFireNode;


function initialization() {
    fireNode =Array.from({ length: space.nodes.length }, () => Array(2).fill(0));
    
    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];

    //////////////////////GPU///////////////////////////
    kernelFireNode = gpu.createKernel(function(node) {
        let res = 0;
        if (node[this.thread.x][1] > 1) res = node[this.thread.x][1] - 1;
        return [0, res];
    }).setOutput([fireNode.length]);




    /////////////////////END GPU////////////////////////
    
}



function tact() {

    fireNode = kernelFireNode(fireNode);

    //arrSensor[1] = Array.from(kernelSensor(arrSensor[1]));

    /*if (spikes.length === 0) return;
    spikes = kernelSpaik(spikes, spikes.length);*/


    /*spikes = spikes.filter(spike => {
        if (spike[0] > spike[1]) return spike[0], spike[1]++, spike[2] ;
    });*/
    
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