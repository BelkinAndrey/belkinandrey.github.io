const btnPlay = document.getElementById('play-stop-btn');

const leftPanel = document.querySelector('.left');
const rightPanel = document.querySelector('.right');
const RemoveAllButton = document.getElementById("remove-all-btn");
const SaveButton = document.getElementById('save-btn');
const OpenButton = document.getElementById('open-btn');
const SelectFile = document.getElementById('select-file');
const listElement = document.getElementById('node-list');
const radioLink = document.getElementsByName('link-type');
const radioNode = document.getElementsByName('node-type');
const linkLabel = document.getElementById('link-label');
const nodeLabel = document.getElementById('node-label');
const butDefLink = document.getElementById('button-default-link');
const butAppLink = document.getElementById('button-applay-link');
const butDefNode = document.getElementById('button-default-node');
const butAppMode = document.getElementById('button-applay-node');

const inpWeight = document.getElementById('weight-input');
const inpWeightMax = document.getElementById('weight-max-input');
const inpWeightMin = document.getElementById('weight-min-input');
const inpDelay = document.getElementById('delay-input');
const inpTimeBefore = document.getElementById('time-before-input');
const inpTimeAfter = document.getElementById('time-after-input');
const inpWeightUp = document.getElementById('weight-up-input');
const inpWeightDown = document.getElementById('weight-down-input');
const inpPlasticity = document.getElementById('plasticity-input');
const inpMemoryTime = document.getElementById('memory-time-input');

const inpThreshold = document.getElementById('threshold-input');
const inpThresholdMax = document.getElementById('threshold-max-input');
const inpThresholdMin = document.getElementById('threshold-min-input');
const inpLevelMax = document.getElementById('level-max-input');
const inpLevelMin = document.getElementById('level-min-input');
const inpLevelLeak = document.getElementById('level-leak-input');
const inpRefractoryPeriod = document.getElementById('refractory-period-input');
const inpModulationLeak = document.getElementById('modulation-leak-input');
const inpKey = document.getElementById('key-input');
const inpId = document.getElementById('id-input');

const inputFields = document.querySelectorAll('input.input-field[type="number"]');


let isResizingLeft = false;
let isResizingRight = false;
let lastX;

leftPanel.addEventListener('mousedown', (e) => {
  if (e.offsetX > leftPanel.offsetWidth - 10) {
    isResizingLeft = true;
    lastX = e.clientX;
  }
});

rightPanel.addEventListener('mousedown', (e) => {
  if (e.target === rightPanel){
    if (e.offsetX < 10) {
      isResizingRight = true;
      lastX = e.clientX;
    }
  }
});

leftPanel.addEventListener('mousemove', (e) => {
  if (e.offsetX > leftPanel.offsetWidth - 10) {
    leftPanel.style.cursor = 'col-resize';
  } else {
    leftPanel.style.cursor = 'default';
  }
});

rightPanel.addEventListener('mousemove', (e) => {
    if (e.offsetX < 10) {
      rightPanel.style.cursor = 'col-resize';
    } else {
      rightPanel.style.cursor = 'default';
    }
});


leftPanel.addEventListener('dblclick', (e) => {
  
    if (e.offsetX > leftPanel.offsetWidth - 10) {
      if (leftPanel.offsetWidth > 5) {  
        leftPanel.style.width = '5px';
        leftPanel.style.overflowY = 'hidden';
      } else {
        leftPanel.style.width = '200px';
        leftPanel.style.overflowY = 'auto';
      }
    }
});
          
rightPanel.addEventListener('dblclick', (e) => {
  if (e.target === rightPanel){
    if (e.offsetX < 10) {
      if (rightPanel.offsetWidth > 5) {
        rightPanel.style.width = '5px';
        rightPanel.style.overflowY = 'hidden';
      } else {
        rightPanel.style.width = '340px';
        rightPanel.style.overflowY = 'auto';
      }
    }
  }
});

document.addEventListener('mousemove', (e) => {
  if (isResizingLeft) {
    const delta = e.clientX - lastX;
    const leftWidth = leftPanel.offsetWidth + delta;
    if (leftWidth > 5) {
      leftPanel.style.width = `${leftWidth}px`;
      leftPanel.style.overflowY = 'auto';
    }
    lastX = e.clientX;
  } else if (isResizingRight) {
    const delta = lastX - e.clientX;
    const rightWidth = rightPanel.offsetWidth + delta;
    if (rightWidth > 5) {
      rightPanel.style.width = `${rightWidth}px`;
    }
    lastX = e.clientX;
  }
});

document.addEventListener('mouseup', () => {
  isResizingLeft = false;
  isResizingRight = false;
});


RemoveAllButton.addEventListener("click", () => {
  RemoveAll();
  graph.clear();
});

SaveButton.addEventListener('click', () => {
  const saveSpace = JSON.parse(localStorage.getItem('space'));
  const blob = new Blob([JSON.stringify(saveSpace)],  {type: 'application/json' });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('download', '');
  const fileName = prompt('File name:', 'neurons');
  if (fileName === null) return;
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(link.href);
});

OpenButton.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = () => {
      RemoveAll();
      graph.clear();
      const openSpace = JSON.parse(reader.result);
      space = openSpace;
      localStorage.setItem('space', JSON.stringify(space));
      StartLoad();
      reFreshInspector();
    };
    reader.readAsText(file);
  };
  input.click();
});


function reFreshInspector(){
  listElement.innerHTML = '';
  space.nodes.forEach(function(node) {
    const ulElement = document.createElement('ul');
    listElement.appendChild(ulElement); 
    const spanArrow = document.createElement('span');
    spanArrow.className = 'arrow';
    ulElement.appendChild(spanArrow);
    const listItem = document.createElement('ul');
    listItem.textContent = node.id;
    
    listItem.addEventListener('click', (event) => {
      if (event.target === listItem){
        const element = graph.getCell(node.id);
        if (element) selectSource(null, paper.findViewByModel(element));
      }
    });


    const ulLinks2 = document.createElement('ul');
    listItem.appendChild(ulLinks2);
    const ulspanArrow2 = document.createElement('span');
    ulspanArrow2.className = 'arrow';
    ulLinks2.appendChild(ulspanArrow2);
    const fromLink = document.createElement('ul');
    fromLink.textContent = "link-from";
    ulLinks2.appendChild(fromLink);
    space.links.forEach(link => {
      if (link.from === node.id) {
        const li = document.createElement('ul');
        li.textContent = link.id; 
        li.addEventListener('click', (event) => {
          if (event.target === li){
            const element = graph.getCell(link.id);
            if (element) selectSource(null, paper.findViewByModel(element));
          }
        });
        fromLink.appendChild(li);
      }
    })
    
    const ulLinks1 = document.createElement('ul');
    listItem.appendChild(ulLinks1);
    const ulspanArrow1 = document.createElement('span');
    ulspanArrow1.className = 'arrow';
    ulLinks1.appendChild(ulspanArrow1);
    const toLink = document.createElement('ul');
    toLink.textContent = "link-to";
    ulLinks1.appendChild(toLink);
    space.links.forEach(link => {
      if (link.to === node.id) {
        const li = document.createElement('ul');
        li.textContent = link.id; 
        li.addEventListener('click', (event) => {
          if (event.target === li){
            const element = graph.getCell(link.id);
            if (element) selectSource(null, paper.findViewByModel(element));
          }
        });
        toLink.appendChild(li);
      }
    })
  
    ulElement.appendChild(listItem);
  })
  
  
  const arrows = document.querySelectorAll('.arrow');
  arrows.forEach(arrow => {
    arrow.addEventListener('click', () => {
      arrow.classList.toggle('open');
      Array.from(arrow.parentNode.children[1].children).forEach(arr => {
        arr.classList.toggle('open')
        Array.from(arr.children).forEach(ar => {
          if (ar.className !== 'arrow') ar.classList.toggle('open');
        });
      });
    });
  });


}


reFreshInspector();


const divsLink = document.getElementsByClassName('input-container-link');

radioLink.forEach(radio => {
  radio.addEventListener('change', () => {
    linkType = parseInt(radio.value);
    changeRadioLink();
    getLinkSettingEditor();
  });
});

function changeRadioLink() {
    for (var i = 0; i < divsLink.length; i++) {
      var dataValue = divsLink[i].getAttribute('data-value');
      if (dataValue.includes(linkType)) {
        divsLink[i].classList.add('open');
      } else {
        divsLink[i].classList.remove('open');
      }
    };
}

const divsNode = document.getElementsByClassName('input-container');

radioNode.forEach(radio => {
  radio.addEventListener('change', () => {
    nodeType = parseInt(radio.value);
    unSelect(null, {button : 0});
    changeRadioNode();
    getNodeSettingEditor();
  });
});

function changeRadioNode() {
  for (var i = 0; i < divsNode.length; i++) {
    var dataValue = divsNode[i].getAttribute('data-value');
    if (dataValue.includes(nodeType)) {
      divsNode[i].classList.add('open');
    } else {
      divsNode[i].classList.remove('open');
    }
  };
}


butDefLink.addEventListener('click', SetDefaultLink);

function SetDefaultLink() {

  inpWeight.value = LinkDefault.direct.weight.toString();
  inpWeightMax.value = LinkDefault.hebb.weightMax.toString();
  inpWeightMin.value = LinkDefault.hebb.weightMin.toString();
  inpDelay.value = LinkDefault.direct.delay.toString();
  inpTimeBefore.value = LinkDefault.hebb.timeBefore.toString();
  inpTimeAfter.value = LinkDefault.hebb.timeAfter.toString();
  inpWeightUp.value = LinkDefault.hebb.weightUp.toString();
  inpWeightDown.value = LinkDefault.hebb.weightDown.toString();
  inpPlasticity.value = LinkDefault.hebb.plasticity.toString();
  inpMemoryTime.value = LinkDefault.hebb.memoryTime.toString();
  

  if (linkType === 1) linkSetting = LinkDefault.direct;
  if (linkType === 2) linkSetting = LinkDefault.modulating;
  if (linkType === 3) linkSetting = LinkDefault.electrical;
  if (linkType === 4) linkSetting = LinkDefault.hebb;

};

SetDefaultLink();

butDefNode.addEventListener('click', SetDefaultNode);

function SetDefaultNode() {
  inpThreshold.value = NeuronDefault.threshold.toString();
  inpThresholdMax.value = NeuronDefault.thresholdMax.toString();
  inpThresholdMin.value = NeuronDefault.thresholdMin.toString();
  inpLevelMax.value = NeuronDefault.levelMax.toString();
  inpLevelMin.value = NeuronDefault.levelMin.toString();
  inpLevelLeak.value = NeuronDefault.levelLeak.toString();
  inpRefractoryPeriod.value = NeuronDefault.refractoryPeriod.toString();
  inpModulationLeak.value = NeuronDefault.modulationLeak.toString();
  inpKey.value = '';
  inpId.value = '';

  if (nodeType === 1) NodeSetting = NeuronDefault;
  if (nodeType === 2) NodeSetting = ActuatorDefault;
  if (nodeType === 3) NodeSetting = SensorDefault;
  if (nodeType === 4) NodeSetting = ModuleDefault;
}

SetDefaultNode();

function SetSettingNode() {
  if (nodeType === 1) {
    inpThreshold.value = NodeSetting.threshold.toString();
    inpThresholdMax.value = NodeSetting.thresholdMax.toString();
    inpThresholdMin.value = NodeSetting.thresholdMin.toString();
    inpLevelMax.value = NodeSetting.levelMax.toString();
    inpLevelMin.value = NodeSetting.levelMin.toString();
    inpLevelLeak.value = NodeSetting.levelLeak.toString();
    inpRefractoryPeriod.value = NodeSetting.refractoryPeriod.toString();
    inpModulationLeak.value = NodeSetting.modulationLeak.toString();
  };

  if (nodeType === 2) {
    inpId.value = NodeSetting.id;
  };

  if (nodeType === 3) {
    inpId.value = NodeSetting.id;
    inpKey.value = NodeSetting.key;
  };
}


function SetSettingLink() {
  switch (linkType) {
    case 1:
    case 2:
      inpWeight.value = linkSetting.weight.toString();
      inpDelay.value = linkSetting.delay.toString();
      break;
    case 3:
      inpDelay.value = linkSetting.delay.toString();
      break;
    case 4:
      inpWeight.value = linkSetting.weight.toString();
      inpWeightMax.value = linkSetting.weightMax.toString();
      inpWeightMin.value = linkSetting.weightMin.toString();
      inpDelay.value = linkSetting.delay.toString();
      inpTimeBefore.value = linkSetting.timeBefore.toString();
      inpTimeAfter.value = linkSetting.timeAfter.toString();
      inpWeightUp.value = linkSetting.weightUp.toString();
      inpWeightDown.value = linkSetting.weightDown.toString();
      inpPlasticity.value = linkSetting.plasticity.toString();
      inpMemoryTime.value = linkSetting.memoryTime.toString();
      break;
  }
}


butAppLink.addEventListener('click', ApplaySettingLink);

function ApplaySettingLink() {
  if (selectLink) {
    const linkSpace = space.links.find(l => l.id === selectLink.model.id);
    if (linkSpace) {
      linkSpace.type = linkType;
      getLinkSettingEditor();
      linkSpace.setting = linkSetting;
      var link = selectLink.model;
      const color = getColorLink(linkSpace);
      link.attr({ 'line': { stroke: color, targetMarker: { fill: color, stroke: color, } } });
      localStorage.setItem("space", JSON.stringify(space));
    }
  }
};

butAppMode.addEventListener('click', ApplaySettingNode);

function ApplaySettingNode() {
  if (selectStart) {
    const NodeSpace = space.nodes.find(N => N.id === selectStart.model.id);
    if (NodeSpace){
      getNodeSettingEditor();
      NodeSpace.setting = NodeSetting;
      localStorage.setItem("space", JSON.stringify(space));
      if (NodeSpace.type === 3) {
        const node = graph.getCell(NodeSpace.id);
        let sizeFront = 12;
        if (NodeSpace.setting.key.length > 3) sizeFront = 4;
        node.attr('label/font-size', sizeFront);
        node.attr('label/text', NodeSpace.setting.key);
      };
    }
  }
};

function getLinkSettingEditor() {
      let weight;
      let delay;
      switch (linkType){
        case 1:
        case 2:
          weight = parseFloat(inpWeight.value);
          delay = parseFloat(inpDelay.value);          
          linkSetting = { weight, delay };               
          break;
        case 3:
          delay = parseFloat(inpDelay.value);
          linkSetting = { delay }; 
          break;
        case 4:
          weight = parseFloat(inpWeight.value);
          delay = parseFloat(inpDelay.value);
          let weightMax = parseFloat(inpWeightMax.value);
          let weightMin = parseFloat(inpWeightMin.value);
          let timeBefore = parseFloat(inpTimeBefore.value);
          let timeAfter = parseFloat(inpTimeAfter.value);
          let weightUp = parseFloat(inpWeightUp.value);
          let weightDown = parseFloat(inpWeightDown.value);
          let plasticity = parseFloat(inpPlasticity.value);
          let memoryTime = parseFloat(inpMemoryTime.value);
          linkSetting = { weight, delay, weightMax, weightMin, timeBefore, timeAfter, weightUp,
            weightDown, plasticity, memoryTime };
          break;
      }
};

function getNodeSettingEditor() {
  if (nodeType === 1) {
    const threshold = parseFloat(inpThreshold.value);
    const thresholdMax = parseFloat(inpThresholdMax.value);
    const thresholdMin = parseFloat(inpThresholdMin.value);
    const levelMax = parseFloat(inpLevelMax.value);
    const levelMin = parseFloat(inpLevelMin.value);
    const levelLeak = parseFloat(inpLevelLeak.value);
    const refractoryPeriod = parseFloat(inpRefractoryPeriod.value);
    const modulationLeak = parseFloat(inpModulationLeak.value);
    NodeSetting = {threshold, thresholdMax, thresholdMin, levelMax, levelMin, levelLeak,
      refractoryPeriod, modulationLeak };
  };

  if (nodeType === 2) {
    const id = inpId.value;
    NodeSetting = { id };
  };

  if (nodeType === 3) {
    const id = inpId.value;
    const key = inpKey.value;
    NodeSetting = { id, key };
  };

  if (nodeType === 4) {
    NodeSetting = {};
  };
};



inputFields.forEach(inputField => {
  let mem = '';

  inputField.addEventListener('focus', () => {
    mem = inputField.value;
  });

  function check () {
    inputField.value = isNaN(parseFloat(inputField.value)) 
      ? mem
      : parseFloat(inputField.value);
    
    if (inputField.hasAttribute('min')) {
      if (parseFloat(inputField.min) > parseFloat(inputField.value))
       inputField.value = inputField.min;
    }
    
  };

  inputField.addEventListener('blur', () => {
    check();
    getLinkSettingEditor();
    getNodeSettingEditor();
  });

  inputField.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      inputField.blur();
      check();
      getLinkSettingEditor();
      getNodeSettingEditor();
      ApplaySettingLink();
      ApplaySettingNode();
    }
  });
});


function handleKeyDown(event) {
  event.preventDefault(); // отменяем стандартное поведение браузера
  const keyInput = document.getElementById("key-input");
  const key = event.key; // получаем нажатую клавишу
  if (key === "Enter") {
    keyInput.blur();
    return false;
  }
  keyInput.value = key; // записываем значение в поле ввода

  getNodeSettingEditor();
  ApplaySettingNode();

  return false; // отменяем дальнейшую обработку события
};


btnPlay.addEventListener('click', () =>{
  if (playing){
    StopSpace();
    StopRender();
    btnPlay.children[0].src = "img/play.png"; 
  } else {
    StartSpace();
    StartRender();
    btnPlay.children[0].src = "img/stop.png";
  }
});

function getColor(startColor, endColor, f) {
  const startRGB = hexToRGB(startColor);
  const endRGB = hexToRGB(endColor);
  const colorDiff = [
    endRGB[0] - startRGB[0],
    endRGB[1] - startRGB[1],
    endRGB[2] - startRGB[2]
  ];
  const r = Math.round(startRGB[0] + colorDiff[0] * f);
  const g = Math.round(startRGB[1] + colorDiff[1] * f);
  const b = Math.round(startRGB[2] + colorDiff[2] * f);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRGB(hex) {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  return [r, g, b];
}

var renderId;

function tactRender() {
  fireNode.forEach((element, index) => {
    const node = graph.getCell(space.nodes[index].id);
    node.attr('body/fill', getColor('#383838', '#ffff00', fireNode[index][1]/100));
  });


  /*const links = graph.getLinks();
  links.forEach(link => {
    while (link.hasLabels()) {
      link.removeLabel();
    }
  });

  spikes.forEach(element => {
    const link = graph.getCell(space.links[element[2]].id);
    link.appendLabel({
      position: element[1]/element[0],
      attrs: {
          text: { text: '1', fontSize: 2, fill: '#FFFF00' },
          rect: { rx: 4, ry: 4, fill: '#FFFF00', stroke: '#FFFF00', strokeWidth: 5 }
      },
    });
  });*/
  renderId = setTimeout(tactRender, 100);
};

function StartRender() {
  renderId = setTimeout(tactRender, 100);
};

function StopRender() {
  clearInterval(renderId);
  
  const nodes = graph.getElements();
  nodes.forEach(node => {
    node.attr('body/fill', '#383838')
  });


  const links = graph.getLinks();
  links.forEach(link => {
    while (link.hasLabels()) {
      link.removeLabel();
    }
  });

};


document.addEventListener('keydown', event => {
  if (playing) {
    arrSensor[0].forEach((key, index) => {
      if (key === event.key) {
        FireSensor(index);
      }
    });
  }
});
