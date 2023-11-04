var playing = false;

var intervalID;

var space = {
    nodes: [],
    links: [],
    net_setting: {},
};

const net_setting_default = {
    weightMax: 1.0,
    weightMin: -1.0,
    trackUp: 0.0003, 
    trackDown: 0.000001,
    rate: 0.01,
    prion: 0.000001,
    border: 0.5,
    degradation: 0,
};

const NeuronDefault = {
    sensitivity: 1.0,
    toplevel: 1.0,
    lowerlevel: 0.0,
    feedback: 0,
    weight: 1.0,
    plasticity: 0.1,
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
        trackStart: 0,
    }
};

var linkType = 1;
var nodeType = 1;
var linkSetting = LinkDefault.direct;
var NodeSetting = NeuronDefault;
var netSetting = net_setting_default;

///////////////////////////////////////////////////

let loopTimes = 0;
let startTime;
var timeDiff;
var linksSort;

var arrSensor;
var insensor;
var LinkData;
var LinkState;
var NodeData;
var NodeState;
var settingData;

const gpu = new GPUX();
var kernelNode;
var kernelLink;



async function initialization() {

    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => item.setting.id),
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];
    ////////////////////////////////////////////////////////////////////

    insensor = Array(space.nodes.length).fill(0);  ///Массив ввода 

    linksSort = space.links.sort((a, b) => {                                    //Сортировка links по цели
        const indexA = space.nodes.findIndex(item => item.id === a.to);
        const indexB = space.nodes.findIndex(item => item.id === b.to);
        return indexA - indexB;
    });

    LinkData = Array.from({ length: space.links.length}, () => Array(4).fill(0));
    LinkData.forEach((item, index) => {
        item[0] = space.nodes.findIndex(node => node.id === linksSort[index].from);  //Индекс источника
        item[1] = space.nodes.findIndex(node => node.id === linksSort[index].to);    //Индекс цели
        item[2] = linksSort[index].type;                                             //type
        item[3] = item[2] == 4 ? linksSort[index].setting.trackStart : 0;                                 
    });

    LinkState = Array.from({ length: space.links.length}, () => Array(3).fill(0));
    LinkState.forEach((item, index) => {
        item[0] = linksSort[index].setting.weight; 
        item[1] = item[0];
        item[2] = LinkData[index][3];
    });

    settingData = Array(8);
    settingData[0] = netSetting.weightMax;
    settingData[1] = netSetting.weightMin;
    settingData[2] = netSetting.trackUp;
    settingData[3] = netSetting.trackDown;
    settingData[4] = netSetting.rate;
    settingData[5] = netSetting.prion;
    settingData[6] = netSetting.border;
    settingData[7] = netSetting.degradation;

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
        item[8] = item[0] == 1 ? space.nodes[index].setting.plasticity : 0;
    });

    NodeState = Array.from({ length: space.nodes.length }, () => Array(3).fill(0));
    
    kernelNode = gpu.createKernel(function(stat, inp, dataNode, dataLink, statLink) {
        let out = 0;
        let sen = 0;
        let pla = 0;
        for (let i = 0; i < dataNode[this.thread.x][6]; i++){
            let index1 = i + dataNode[this.thread.x][7];
            let index2 = dataLink[index1][0];
            let f = stat[index2][0]; 
            f = Math.min(f, 1);
            if (dataLink[index1][2] == 1 || dataLink[index1][2] == 4){
                out += statLink[index1][0] * f; 
            };
            if (dataLink[index1][2] == 2){
                sen += statLink[index1][0] * f;
            };
            if (dataLink[index1][2] == 3){
                pla += statLink[index1][0] * f;
            }
        }
        sen = Math.max(sen + dataNode[this.thread.x][1], 0);
        pla = Math.min(Math.max(pla + dataNode[this.thread.x][8], 0), 1);
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
        return [out, sen, pla];
    }).setOutput([space.nodes.length]);

    kernelLink = gpu.createKernel(function(statLink, setData, statNode, dataLink){
        let wei = statLink[this.thread.x][0];
        let tar = statLink[this.thread.x][1];
        let tra = statLink[this.thread.x][2];
        if (dataLink[this.thread.x][2] == 4) {
            let index_a = dataLink[this.thread.x][0];
            let index_b = dataLink[this.thread.x][1];
            let a = statNode[index_a][0];
            let b = statNode[index_b][0];
            let f = -setData[3];
            if (b * a > 0.01) { f = setData[2] * a }
            else { f = -setData[3] };
            tra += f;
            tra = Math.min(Math.max(tra, 0), 1);

            let t = (a - setData[6]) * setData[4] + tra * setData[4];
            tar += t * b;  
            tar = Math.min(Math.max(tar, setData[1]), setData[0]);

            wei = wei * (1 - setData[7] * b * statNode[index_a][2]); 

            if (tar > wei) { tar -=  Math.min(setData[5], tar - wei) };
            if (tar < wei) { tar +=  Math.min(setData[5], wei - tar) };

            let s = (setData[0] - setData[1]) * statNode[index_a][2];

            if (wei > tar) { wei -= Math.min(s, wei - tar) };
            if (wei < tar) { wei += Math.min(s, tar - wei) };
        };
        return [wei, tar, tra]; 
    }).setOutput([space.links.length]);
}



async function tact() {
  let endTime = new Date().getTime();
  timeDiff = endTime - startTime;
  startTime = endTime;

  NodeState = kernelNode(NodeState, insensor, NodeData, LinkData, LinkState);
  insensor.fill(0); 
  LinkState = kernelLink(LinkState, settingData, NodeState, LinkData);

  loopTimes = 1 - loopTimes;
  intervalID = setTimeout(tact, 10);
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

function ApplyLearning(){
    space.links.forEach(item => {
        if (item.type == 4) {
            const index = linksSort.findIndex(element => element.id === item.id);
            item.setting.weight = LinkState[index][0];
            item.setting.trackStart = LinkState[index][2];
        };
    });
};