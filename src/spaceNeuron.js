var playing = false;

var intervalID;

var space = {
    nodes: [],
    links: [],
};

const NeuronDefault = {
    sensitivity: 1.0,
    toplevel: 1.0,
    lowerlevel: 0.0,
    feedback: 0,
    weight: 1.0,
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
        weight: 1.0,
    },
    modulating: {
        weight: 1.0,
    },
    plasticity: {
        weight: 1.0,
    },
    hebb: {
        weight: 0.0,
        weightMax: 1.0,
        weightMin: -1.0,
        thresholdFrom: 0.9,
        thresholdTo: 0.9,
        trackUp: 0.3, 
        trackDown: 0.001,
        rate: 1.0,
        degradation: 1.0,
        plasticity: 1.0,
    }
};

var linkType = 1;
var nodeType = 1;
var linkSetting = LinkDefault.direct;
var NodeSetting = NeuronDefault;

///////////////////////////////////////////////////

let loopTimes = 0;
let startTime;
var timeDiff;

var arrSensor;
var insensor;
var LinkData;
var NodeData;
var NodeState;

const gpu = new GPUX();
var kernelNode;



async function initialization() {

    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => item.setting.id),
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];
    ////////////////////////////////////////////////////////////////////

    insensor = Array(space.nodes.length).fill(0);  ///Массив ввода 

    let linksSort = space.links.sort((a, b) => {                                    //Сортировка links по цели
        const indexA = space.nodes.findIndex(item => item.id === a.to);
        const indexB = space.nodes.findIndex(item => item.id === b.to);
        return indexA - indexB;
    });

    LinkData = Array.from({ length: space.links.length}, () => Array(4).fill(0));
    LinkData.forEach((item, index) => {
        item[0] = space.nodes.findIndex(node => node.id === linksSort[index].from);  //Индекс источника
        item[1] = space.nodes.findIndex(node => node.id === linksSort[index].to);    //Индекс цели
        item[2] = linksSort[index].type;                                             //type
        item[3] = linksSort[index].setting.weight;                                   //weight
    });

    const countlink = space.nodes.map((el) => {                                      //Количество входищих link
        return linksSort.filter(item => item.to === el.id).length;
    });
  
    const startlink = space.nodes.map((el) => {                                      //Первый индекс входящего link в отсортированном списке
        return linksSort.findIndex(item => item.to === el.id);
    });
    

    NodeData = Array.from({length: space.nodes.length}, () => Array(9).fill(0));
    NodeData.forEach((item, index) => {
        item[0] = space.nodes[index].type;
        item[1] = item[0] == 1 ? space.nodes[index].setting.sensitivity : 1;
        item[2] = item[0] == 1 ? space.nodes[index].setting.toplevel : 1;
        item[3] = item[0] == 1 ? space.nodes[index].setting.lowerlevel : 0;
        item[4] = item[0] == 1 ? space.nodes[index].setting.feedback : 0;
        item[5] = item[0] == 1 ? space.nodes[index].setting.weight : 0;
        item[6] = countlink[index];
        item[7] = startlink[index];
    });

    NodeState = Array.from({ length: space.nodes.length }, () => Array(2).fill(0));

    /*NodeState.forEach((item, index) => {
        item[0] = 0;                       //output
        item[1] = 0;                       //sensitivity
    });*/

    /////////////////////////////////////////////////////////////////////////////////
    
    kernelNode = gpu.createKernel(function(stat, inp, dataNode, dataLink) {
        let out = 0;
        let sen = 0;
        for (let i = 0; i < dataNode[this.thread.x][6]; i++){
            let index1 = i + dataNode[this.thread.x][7];
            let index2 = dataLink[index1][0];
            let f = stat[index2][0]; 
            f = Math.min(f, 1);
            if (dataLink[index1][2] == 1 || dataLink[index1][2] == 4){
                out += dataLink[index1][3] * f; 
            };
            if (dataLink[index1][2] == 2){
                sen += dataLink[index1][3] * f;
            }
        }
        sen = Math.max(sen + dataNode[this.thread.x][1], 0);
        out = out + (dataNode[this.thread.x][4] * dataNode[this.thread.x][5] * stat[this.thread.x][0]);
        out = out * sen;
        let def = dataNode[this.thread.x][2] - dataNode[this.thread.x][3];
        if (def == 0) {
            if (out <  dataNode[this.thread.x][2]) {
                out = 0;
            } else {
                out = 1;
            };
        } else {
            out = (out - dataNode[this.thread.x][3])/def;
            out = Math.max(Math.min(out, 1), 0);
        }
        out = out + inp[this.thread.x];
        return [out, sen];
    }).setOutput([space.nodes.length]);
}



async function tact() {
  let endTime = new Date().getTime();
  timeDiff = endTime - startTime;
  startTime = endTime;

  NodeState = kernelNode(NodeState, insensor, NodeData, LinkData);
  insensor.fill(0); 

  loopTimes = 1 - loopTimes;
  intervalID = setTimeout(tact, 100);
};


async function StartSpace() {
    playing = true;
    loopTimes = 0;
    initialization();
    intervalID = setTimeout(tact, 100);  
};

function StopSpace() {
    playing = false;
    clearInterval(intervalID);

    arrSensor = [];
    spikes = [];
};

function FireSensor(index, val=1) {
    insensor[arrSensor[2][index]] = val; 
};