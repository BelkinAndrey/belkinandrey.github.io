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

///////////////////////////////////////////////////

var arrSensor;
var arrLinkData;
var linksData;
var nodeData;
var nodeState;
var spikes;
var insensor;

var gpuBufferLinksData;
var gpuBufferNodeData;
var gpuBufferStateNode;
var gpuBufferSpikes;
var gpuBufferInsensor;

var commandEncoder;
var device;

var computePipelineSpikepass;
var computePipelineNodepass;
var bindGroupSpike;
var bindGroupNode;

var gpuBuefferRenderNode;
var gpuBuefferRenderSpiks;

var fireNode = [];
var renderspike;

let loopTimes = 0;
let startTime;
var timeDiff;

async function initGPU () {
  if (!("gpu" in navigator)) {
    console.log("WebGPU is not supported.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { 
    console.log('Failed to get GPU adapter.');
  };

  device = await adapter.requestDevice();
  console.log(device);
};


async function initialization() {

    await initGPU();

    const filterSensor = space.nodes.filter(item => item.type === 3);
    arrSensor = [
        filterSensor.map(item => item.setting.key),           //Значение клаыиши
        filterSensor.map(item => space.nodes.indexOf(item))   //Индекс узла в прострастве нейронов
    ];
    ////////////////////////////////////////////////////////////////////

    insensor = new Float32Array(Array(space.nodes.length).fill(0));

    arrLinkData = Array.from({ length: space.links.length}, () => Array(5).fill(0));
    arrLinkData.forEach((item, index) => {
        item[0] = space.nodes.findIndex(node => node.id === space.links[index].from);    //Индекс источника
        item[1] = space.nodes.findIndex(node => node.id === space.links[index].to);    //Индекс цели
        item[2] = space.links[index].setting.delay;                                    //delay
        item[3] = space.links[index].type;                                             //type
        item[4] = item[3] == 3 ? 1 : space.links[index].setting.weight;                //weight
    });

    linksData = new Float32Array(arrLinkData.flat());
    

    let arrNodeData = Array.from({length: space.nodes.length}, () => Array(9).fill(0));
    arrNodeData.forEach((item, index) => {
        item[0] = space.nodes[index].type;
        item[1] = item[0] == 1 ? space.nodes[index].setting.threshold : 0;
        item[2] = item[0] == 1 ? space.nodes[index].setting.thresholdMax : 0;
        item[3] = item[0] == 1 ? space.nodes[index].setting.thresholdMin : 0;
        item[4] = item[0] == 1 ? space.nodes[index].setting.levelMax : 1;
        item[5] = item[0] == 1 ? space.nodes[index].setting.levelMin : 0;
        item[6] = item[0] == 1 ? space.nodes[index].setting.levelLeak : 1;
        item[7] = item[0] == 1 ? space.nodes[index].setting.refractoryPeriod : 0;
        item[8] = item[0] == 1 ? space.nodes[index].setting.modulationLeak : 0;
    });

    nodeData = new Float32Array(arrNodeData.flat());

    let arrNodeState = Array.from({ length: space.nodes.length }, () => Array(4).fill(0));

    arrNodeState.forEach((item, index) => {
        item[0] = 0;                    //Fire/postFire
        item[1] = 0;                    //Level
        item[2] = arrNodeData[index][1];   //start threshold
        item[3] = 0;                    //refractoryPeriod
    });

    nodeState = new Float32Array(arrNodeState.flat());

    let arrSpikes = Array.from({length: space.links.length}, () => Array(32).fill(-1));
    arrSpikes[0] = Array(32).fill(0);

    spikes = new Float32Array(arrSpikes.flat());
    

    ///////////////////////////////Оюьявлеине GPU буферов////////////////////////////////
    gpuBufferLinksData = device.createBuffer({
        mappedAtCreation: true,
        size: linksData.byteLength,
        usage: GPUBufferUsage.STORAGE,
    });

    gpuBufferNodeData = device.createBuffer({
        mappedAtCreation: true,
        size: nodeData.byteLength,
        usage: GPUBufferUsage.STORAGE,
    });

    gpuBufferStateNode = Array(2);
    gpuBufferSpikes = Array(2);
    for (let i = 0; i < 2; i++){
      gpuBufferStateNode[i] = device.createBuffer({
        mappedAtCreation: true,
        size: nodeState.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE
      });

      gpuBufferSpikes[i] = device.createBuffer({
        mappedAtCreation: true,
        size: spikes.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE
      });
    };

    gpuBufferInsensor = device.createBuffer({
        mappedAtCreation: true,
        size: insensor.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    gpuBuefferRenderNode = device.createBuffer({
      size: nodeState.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    gpuBuefferRenderSpiks = device.createBuffer({
      size: spikes.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    /////////////////////////Передача данных и стартовых значений////////////////////////////////////    

    new Float32Array(gpuBufferLinksData.getMappedRange()).set(linksData);
    gpuBufferLinksData.unmap();

    new Float32Array(gpuBufferNodeData.getMappedRange()).set(nodeData);
    gpuBufferNodeData.unmap();

    for (let i = 0; i < 2; i++){
      new Float32Array(gpuBufferStateNode[i].getMappedRange()).set(nodeState);
      gpuBufferStateNode[i].unmap();

      new Float32Array(gpuBufferSpikes[i].getMappedRange()).set(spikes);
      gpuBufferSpikes[i].unmap();
    };

    new Float32Array(gpuBufferInsensor.getMappedRange()).set(insensor);
    gpuBufferInsensor.unmap();


    ///////////////////////////////////////////////////////////////////////

    const shaderModule = device.createShaderModule({
        code: /* wgsl */`
        struct link {
            index_from : f32,
            index_to : f32,
            delay : f32,
            type_link : f32,
            weight : f32, 
        }  

        struct node {
            type_node : f32,
            threshold : f32,
            thresholdMax : f32,
            thresholdMin : f32,
            levelMax : f32,
            levelMin : f32,
            levelLeak : f32,
            refractoryPeriod : f32,
            modulationLeak : f32,
        }

        struct statenode {
            postFire : f32,
            Level_node : f32,
            threshold : f32,
            refractoryPeriod : f32,
        }

        struct spike {
            index : f32,
            time : array<f32, 31>,
        }


        @group(0) @binding(0) var<storage, read> linkData : array<link>;
        @group(0) @binding(1) var<storage, read> nodeData : array<node>;
        @group(0) @binding(2) var<storage, read> inNodeState : array<statenode>;
        @group(0) @binding(3) var<storage, read> inSpikes : array<spike>;
        @group(0) @binding(4) var<storage, read_write> outNodeState : array<statenode>;
        @group(0) @binding(5) var<storage, read_write> outSpikes : array<spike>;
        @group(0) @binding(6) var<storage, read> insensor : array<f32>;

        @compute @workgroup_size(8, 32)
        fn spikepass(@builtin(global_invocation_id) global_id : vec3u) {
           if (global_id.y == 0) {
                return;
           }    
           
           outSpikes[global_id.x].time[global_id.y - 1] = inSpikes[global_id.x].time[global_id.y - 1] - 1;
           if (outSpikes[global_id.x].time[global_id.y - 1] < 0) { 
                outSpikes[global_id.x].time[global_id.y - 1] = -1;
                let indexfrom = u32(linkData[global_id.x].index_from);
                if ((u32(inSpikes[global_id.x].index) == global_id.y - 1) && (inNodeState[indexfrom].postFire == 100f)){
                    outSpikes[global_id.x].index = inSpikes[global_id.x].index + 1f;
                    if (outSpikes[global_id.x].index > 30f) { outSpikes[global_id.x].index = 0f; }
                    outSpikes[global_id.x].time[global_id.y - 1] = linkData[global_id.x].delay;
                } 
           }

           if (outSpikes[global_id.x].time[global_id.y - 1] == 0) {
                let indexNode = u32(linkData[global_id.x].index_to);

                if (linkData[global_id.x].type_link == 1 || linkData[global_id.x].type_link == 4) {
                    outNodeState[indexNode].Level_node = inNodeState[indexNode].Level_node + linkData[global_id.x].weight; 
                    outNodeState[indexNode].Level_node = clamp(outNodeState[indexNode].Level_node, nodeData[indexNode].levelMin, nodeData[indexNode].levelMax);

                }

                if (linkData[global_id.x].type_link == 2){
                    outNodeState[indexNode].threshold = inNodeState[indexNode].threshold + linkData[global_id.x].weight;
                    outNodeState[indexNode].threshold = clamp(outNodeState[indexNode].threshold, nodeData[indexNode].thresholdMin, nodeData[indexNode].thresholdMax);
                }

                if (linkData[global_id.x].type_link == 3 && inNodeState[indexNode].refractoryPeriod == 0){
                    outNodeState[indexNode].postFire = 101f;
                    outNodeState[indexNode].refractoryPeriod = nodeData[indexNode].refractoryPeriod + 1f;
                }

           }

        }


        @compute @workgroup_size(32)
        fn nodepass(@builtin(global_invocation_id) global_id : vec3u) {
            outNodeState[global_id.x].postFire = inNodeState[global_id.x].postFire - 1;
            if (outNodeState[global_id.x].postFire < 0) { outNodeState[global_id.x].postFire = 0; }
            outNodeState[global_id.x].refractoryPeriod = inNodeState[global_id.x].refractoryPeriod - 1;
            if (outNodeState[global_id.x].refractoryPeriod < 0) { outNodeState[global_id.x].refractoryPeriod = 0; }
            

            if (inNodeState[global_id.x].Level_node > inNodeState[global_id.x].threshold && inNodeState[global_id.x].refractoryPeriod == 0) {
                outNodeState[global_id.x].postFire = 100;
                outNodeState[global_id.x].refractoryPeriod = nodeData[global_id.x].refractoryPeriod;
            }    

            if (insensor[global_id.x] > 0) { outNodeState[global_id.x].postFire = 100; }

            if (inNodeState[global_id.x].Level_node > 0) {
                outNodeState[global_id.x].Level_node = inNodeState[global_id.x].Level_node - nodeData[global_id.x].levelLeak;
                if (outNodeState[global_id.x].Level_node < 0) { outNodeState[global_id.x].Level_node = 0; }
            } else {
                outNodeState[global_id.x].Level_node = inNodeState[global_id.x].Level_node + nodeData[global_id.x].levelLeak;
                if (outNodeState[global_id.x].Level_node > 0) { outNodeState[global_id.x].Level_node = 0; }
            }

            if (inNodeState[global_id.x].threshold > nodeData[global_id.x].threshold) {
                outNodeState[global_id.x].threshold = inNodeState[global_id.x].threshold - nodeData[global_id.x].modulationLeak;
                if (outNodeState[global_id.x].threshold < nodeData[global_id.x].threshold) { outNodeState[global_id.x].threshold = nodeData[global_id.x].threshold; }
            } else {
                outNodeState[global_id.x].threshold = inNodeState[global_id.x].threshold + nodeData[global_id.x].modulationLeak;
                if (outNodeState[global_id.x].threshold > nodeData[global_id.x].threshold) { outNodeState[global_id.x].threshold = nodeData[global_id.x].threshold; }
            }

        }
        `
    });

    //////////////////////////////////////////////////////////////

    computePipelineSpikepass = device.createComputePipeline({   //createComputePipelineAsync
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "spikepass"
        }
    });

   
    computePipelineNodepass = device.createComputePipeline({    //createComputePipelineAsync
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "nodepass"
        }
    });

    //////////////////////////////////////////////////////////////

    bindGroupSpike = new Array(2);
    bindGroupNode = new Array(2);

    for (let i = 0; i < 2; i++){
    bindGroupSpike[i] = device.createBindGroup({
        layout:  computePipelineSpikepass.getBindGroupLayout(0 /* index */),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: gpuBufferLinksData
            }
          },
          {
            binding: 1,
            resource: {
              buffer: gpuBufferNodeData
            }
          },
          {
            binding: 2,
            resource: {
              buffer: gpuBufferStateNode[i]
            }
          },
          {
            binding: 3,
            resource: {
              buffer: gpuBufferSpikes[i]
            }
          },
          {
            binding: 4,
            resource: {
              buffer: gpuBufferStateNode[(i + 1) % 2]
            }
          },
          {
            binding: 5,
            resource: {
              buffer: gpuBufferSpikes[(i + 1) % 2]
            }
          }
        ]
    });
   


    bindGroupNode[i] = device.createBindGroup({
        layout:  computePipelineNodepass.getBindGroupLayout(0 /* index */),
        entries: [
          {
            binding: 1,
            resource: {
              buffer: gpuBufferNodeData
            }
          },
          {
            binding: 2,
            resource: {
              buffer: gpuBufferStateNode[(i + 1) % 2]
            }
          },
          {
            binding: 4,
            resource: {
              buffer: gpuBufferStateNode[i]
            }
          },
          {
            binding: 6,
            resource: {
              buffer: gpuBufferInsensor
            }
          }
        ]
    });
    };
    
    

    //////////////////////////////////////////////////////////
   

    
}



async function tact() {

  let endTime = new Date().getTime();
  timeDiff = endTime - startTime;
  startTime = endTime;

  commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipelineSpikepass);
  passEncoder.setBindGroup(0, bindGroupSpike[loopTimes]);
  let workgroupCountX = Math.ceil(space.links.length / 8);
  passEncoder.dispatchWorkgroups(workgroupCountX, 1);
  
  passEncoder.setPipeline(computePipelineNodepass);
  passEncoder.setBindGroup(0, bindGroupNode[loopTimes]);
  workgroupCountX = Math.ceil(space.nodes.length / 32);
  passEncoder.dispatchWorkgroups(workgroupCountX, 1);
  passEncoder.end();

  commandEncoder.copyBufferToBuffer(gpuBufferStateNode[loopTimes], 0, gpuBuefferRenderNode, 0, nodeState.byteLength);
  commandEncoder.copyBufferToBuffer(gpuBufferSpikes[loopTimes], 0, gpuBuefferRenderSpiks, 0, spikes.byteLength);
  commandEncoder.clearBuffer(gpuBufferInsensor, 0, insensor.byteLength);

  device.queue.submit([commandEncoder.finish()]);

  await gpuBuefferRenderNode.mapAsync(GPUMapMode.READ);
  fireNode = new Float32Array(gpuBuefferRenderNode.getMappedRange().slice());
  gpuBuefferRenderNode.unmap();

  await gpuBuefferRenderSpiks.mapAsync(GPUMapMode.READ);
  renderspike = new Float32Array(gpuBuefferRenderSpiks.getMappedRange().slice());
  gpuBuefferRenderSpiks.unmap();

  loopTimes = 1 - loopTimes;
  intervalID = setTimeout(tact, 1);
};


async function StartSpace() {
    playing = true;
    loopTimes = 0;
    await initialization();
    intervalID = setTimeout(tact, 1);  
};

function StopSpace() {
    playing = false;
    clearInterval(intervalID);

    arrSensor = [];
    spikes = [];
};

function FireSensor(index) {
    insensor[arrSensor[1][index]] = 1; 
    device.queue.writeBuffer(gpuBufferInsensor, 0, insensor);
    insensor[arrSensor[1][index]] = 0; 
};