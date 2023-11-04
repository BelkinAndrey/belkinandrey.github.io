const btnPlay = document.getElementById('play-stop-btn');                 //Кнопка плей/стоп
const btnLearn = document.getElementById('learning-btn');                 //Кнопка применить обучение
const btndivLearn = document.getElementById('button-learning');           //Для изменния видимости кнопки применить обучение
const leftPanel = document.querySelector('.left');                        //левая панель
const rightPanel = document.querySelector('.right');                      //правая панель
const RemoveAllButton = document.getElementById("remove-all-btn");        //кнопка очистить всё
const SaveButton = document.getElementById('save-btn');                   //кнопка сохранить/скачать
const OpenButton = document.getElementById('open-btn');                   //кнопка открыть/загрузить
const SelectFile = document.getElementById('select-file');                //выподающее меню выюора файла  
const listElement = document.getElementById('node-list');                 //Левая панел дерево обьектов
const radioLink = document.getElementsByName('link-type');                //Кнопки переключения типа связи
const radioNode = document.getElementsByName('node-type');                //Кнопки переключения типа нод
const linkLabel = document.getElementById('link-label');                  //Заголовок Link 
const nodeLabel = document.getElementById('node-label');                  //Заголовок Node
const butDefLink = document.getElementById('button-default-link');        //Кнопка по умолчанию связи
const butAppLink = document.getElementById('button-applay-link');         //Кнопка применить для связи
const butDefNode = document.getElementById('button-default-node');        //Кнопка по умолчанию для ноды
const butAppNode = document.getElementById('button-applay-node');         //Кнопка применить для ноды

const seltypemod = document.getElementById('select-type-module');         //Выпадающий список тип модуля

const inpWeight = document.getElementById('weight-input');                //Строка ввода значение веса для связи
const inpWeightMax = document.getElementById('weight-max-input');         //Строка ввода максимальный вес для хебба
const inpWeightMin = document.getElementById('weight-min-input');         //Строка ввода минимальный вес для хебба
const inpTrack = document.getElementById('track-start-input');            //Строка ввода стартового следа
const inptrackUp = document.getElementById('track-up-input');             //Строка ввода значение увеличение следа
const inptrackDown = document.getElementById('track-down-input');         //Строка ввода значение снижения следа
const inprate = document.getElementById('rate-input');                    //Строка ввода награда
const inpPrion = document.getElementById('prion-input');                  //Строка ввода утечка прионов
const inpBorder = document.getElementById('border-input');                //Строка ввода границы
const inpDegradation = document.getElementById('degradation-input');      //Строка ввода деградации
const labelWeight = document.getElementById('weight-output');             //Метка веса
const labelTarget = document.getElementById('target-weight-output');      //Метка целевого веса
const labelTrack = document.getElementById('track-output');               //Метка следа



const labeloutput = document.getElementById('output-output');             //Метка выхода
const labelsensitivity = document.getElementById('sensitivity-output');   //Метка чувствительности
const labelplasticity = document.getElementById('plasticity-output');     //Метка пластичности
const inpSensitivity = document.getElementById('sensitivity-input');      //Строка ввода чувствительность
const inptoplevel = document.getElementById('top-level-input');           //Строка ввода верхни предел уровня
const inplowerlevel = document.getElementById('lower-level-input');       //Строка ввода нижний предел уровня
const inpfeedback = document.getElementById('feedback-input');            //Галочка есть ли обратная связь
const inpweightnode = document.getElementById('weight-node-input');       //Строка ввода вес обратной связи
const inpPlasticity = document.getElementById('node-plasticity');         //Строка ввода пластичность для ноды
const inpKey = document.getElementById('key-input');                      //Строка ввода клавиши для ноды
const inpId = document.getElementById('id-input');                        //Строка ввода id для ноды

const inputFields = document.querySelectorAll('input.input-field[type="number"]');  //Все строки ввода цифр 

const openWin = document.getElementById('open-windows');                  //Выподающее меню открыть окно
const labelTime = document.getElementById('label-time');                  //Вывод интервала времени между тактами 

var key_down = null;

/////////////////////Управление боковыми панелями
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

//////////////////////////////////////end управление боковыми панелями

//////////////////Конпка очистить всё
RemoveAllButton.addEventListener("click", () => {
  RemoveAll();
  graph.clear();
});

/////////////////Конпка сохрать
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


/////////////////Кнопка открыть
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

///////////////////Дерево обьектов в левой панели
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


//////////////////////////end Дерево обьектов в левой панели

//////////////////////////Кнопки переключения типов связи
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

//////////////////////////Кнопки переключения типов нод
var moduleType = 'u';
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
      if ((nodeType != 4) || (dataValue.includes(moduleType))) divsNode[i].classList.add('open');
    } else {
      divsNode[i].classList.remove('open');
    }
  };
}

seltypemod.addEventListener('change', () => {
  moduleType = seltypemod.value;
  for (var i = 0; i < divsNode.length; i++) {
      divsNode[i].classList.remove('open');
  };
  changeRadioNode();
});
/////////////////////////


//////////////////////////Установить значения связей по умолчанияю
butDefLink.addEventListener('click', SetDefaultLink);

function SetDefaultLink() {

  inpWeight.value = LinkDefault.direct.weight.toString();
  inpTrack.value = LinkDefault.hebb.trackStart.toString();

  
  inpWeightMax.value = net_setting_default.weightMax.toString();
  inpWeightMin.value = net_setting_default.weightMin.toString();
  inptrackUp.value = net_setting_default.trackUp.toString();
  inptrackDown.value = net_setting_default.trackDown.toString();
  inprate.value = net_setting_default.rate.toString();
  inpPrion.value = net_setting_default.prion.toString();
  inpBorder.value = net_setting_default.border.toString();
  inpDegradation.value = net_setting_default.degradation.toString();


  if (linkType === 1) linkSetting = LinkDefault.direct;
  if (linkType === 2) linkSetting = LinkDefault.modulating;
  if (linkType === 3) linkSetting = LinkDefault.plasticity;
  if (linkType === 4) linkSetting = LinkDefault.hebb;
};

SetDefaultLink();

///////////////////Установить значения по умолчанию для нод
butDefNode.addEventListener('click', SetDefaultNode);

function SetDefaultNode() {

  inpSensitivity.value = NeuronDefault.sensitivity.toString();
  inptoplevel.value = NeuronDefault.toplevel.toString();
  inplowerlevel.value = NeuronDefault.lowerlevel.toString();
  inpfeedback.checked = NeuronDefault.feedback == 1 ? true : false;
  inpweightnode.value = NeuronDefault.weight.toString();
  inpPlasticity.value = NeuronDefault.plasticity.toString();

  inpKey.value = '';
  inpId.value = '';

  if (nodeType === 1) NodeSetting = NeuronDefault;
  if (nodeType === 2) NodeSetting = ActuatorDefault;
  if (nodeType === 3) NodeSetting = SensorDefault;
  if (nodeType === 4) NodeSetting = ModuleDefault;
}

SetDefaultNode();
/////////////////////////
////////////////////////Получить настройки выделенного узла
function SetSettingNode() {
  if (nodeType === 1) {
    inpSensitivity.value = NodeSetting.sensitivity.toString();
    inptoplevel.value = NodeSetting.toplevel.toString();
    inplowerlevel.value = NodeSetting.lowerlevel.toString();
    inpfeedback.checked = NodeSetting.feedback == 1 ? true : false;
    inpweightnode.value = NodeSetting.weight.toString();
    if (NodeSetting.plasticity == null) inpPlasticity.value = NeuronDefault.plasticity.toString()
    else inpPlasticity.value = NodeSetting.plasticity.toString();
  };

  if (nodeType === 2) {
    inpId.value = NodeSetting.id;
  };

  if (nodeType === 3) {
    inpId.value = NodeSetting.id;
    inpKey.value = NodeSetting.key;
  };
}

function SetSettingNet() {
  if (space.net_setting == null) {
    inpWeightMax.value = net_setting_default.weightMax.toString();
    inpWeightMin.value = net_setting_default.weightMin.toString();
    inptrackUp.value = net_setting_default.trackUp.toString();
    inptrackDown.value = net_setting_default.trackDown.toString();
    inprate.value = net_setting_default.rate.toString();
    inpPrion.value = net_setting_default.prion.toString();
    inpBorder.value = net_setting_default.border.toString();
    inpDegradation.value = net_setting_default.degradation.toString();
  } else {
    inpWeightMax.value = space.net_setting.weightMax.toString();
    inpWeightMin.value = space.net_setting.weightMin.toString();
    inptrackUp.value = space.net_setting.trackUp.toString();
    inptrackDown.value = space.net_setting.trackDown.toString();
    inprate.value = space.net_setting.rate.toString();
    inpPrion.value = space.net_setting.prion.toString();
    if (space.net_setting.border != null) inpBorder.value = space.net_setting.border.toString();
    else inpBorder.value = net_setting_default.border.toString();
    if (space.net_setting.degradation != null) inpDegradation.value = space.net_setting.degradation.toString();
    else inpDegradation.value = net_setting_default.degradation.toString();
  }
};

////////////////////////Получить настройки выделенной связи
function SetSettingLink() {
  switch (linkType) {
    case 1:
    case 2:
    case 3:
      inpWeight.value = linkSetting.weight.toString();
      break;
    case 4:
      inpWeight.value = linkSetting.weight.toString();
      if (linkSetting.trackStart == null) inpTrack.value = LinkDefault.trackStart.toString()
      else inpTrack.value = linkSetting.trackStart.toString();
      SetSettingNet();
      break;
  }
}

/////////////////////Применить параметры к связи
butAppLink.addEventListener('click', ApplaySettingLink);

function ApplaySettingLink() {

  getNetSettingEditor();
  space.net_setting = netSetting;

  if (selectLink) {
    const linkSpace = space.links.find(l => l.id === selectLink.model.id);
    if (linkSpace) {
      linkSpace.type = linkType;
      getLinkSettingEditor();
      linkSpace.setting = linkSetting;
      var link = selectLink.model;
      const color = getColorLink(linkSpace);
      link.attr({ 'line': { stroke: color, targetMarker: { fill: color, stroke: color, } } });
    }
  }

  localStorage.setItem("space", JSON.stringify(space));
  StopSpace();
  StopRender();
  btnPlay.children[0].src = "img/play.png"; 
};

/////////////////////Применить параметры к ноде
butAppNode.addEventListener('click', ApplaySettingNode);

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
      if (NodeSpace.type === 1) {
        const node = graph.getCell(NodeSpace.id);
        let symbol = '';
        if (NodeSpace.setting.feedback == 1) symbol = '⟲';
        node.attr('label/font-size', 15);
        node.attr('label/text', symbol);
      };

      StopSpace();
      StopRender();
      btnPlay.children[0].src = "img/play.png"; 
    }
  }
};

function getNetSettingEditor() {
  const weightMax = parseFloat(inpWeightMax.value);
  const weightMin = parseFloat(inpWeightMin.value);
  const trackUp = parseFloat(inptrackUp.value);
  const trackDown = parseFloat(inptrackDown.value);
  const rate = parseFloat(inprate.value);
  const prion = parseFloat(inpPrion.value);
  const border = parseFloat(inpBorder.value);
  const degradation = parseFloat(inpDegradation.value);
  netSetting = { weightMax, weightMin, trackUp, trackDown, rate, prion, border, degradation };
} ;

///////////////////////Применить настройки связей
function getLinkSettingEditor() {
      let weight = 0;
      switch (linkType){
        case 1:
        case 2:
        case 3:
          weight = parseFloat(inpWeight.value); 
          linkSetting = { weight }; 
          break;
        case 4:
          weight = parseFloat(inpWeight.value);
          const trackStart = parseFloat(inpTrack.value);
          linkSetting = { weight, trackStart };
          break;
      }
};

///////////////////////Применить настройки нод
function getNodeSettingEditor() {
  if (nodeType === 1) {
    const sensitivity = parseFloat(inpSensitivity.value);
    const toplevel = parseFloat(inptoplevel.value);
    const lowerlevel = parseFloat(inplowerlevel.value);
    const feedback = inpfeedback.checked ? 1 : 0;
    const weight = parseFloat(inpweightnode.value);
    const plasticity = parseFloat(inpPlasticity.value);
    NodeSetting = {sensitivity, toplevel, lowerlevel, feedback, weight, plasticity };
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


/////////////////При редактировании сторок ввода цифровых
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

inpfeedback.addEventListener("change", () => {
  getNodeSettingEditor();
  ApplaySettingNode(); 
});


function handleKeyDown(event) {
  event.preventDefault(); 
  const keyInput = document.getElementById("key-input");
  const key = event.key; 
  if (key === "Enter") {
    keyInput.blur();
    return false;
  }
  keyInput.value = key; 

  getNodeSettingEditor();
  ApplaySettingNode();

  return false; 
};


btnPlay.addEventListener('click',  async () =>{
  if (playing){
    StopRender();
    StopSpace();
    btnPlay.children[0].src = "img/play.png"; 
    btndivLearn.classList.add('open');
  } else {
    StartSpace();
    StartRender();
    btnPlay.children[0].src = "img/stop.png";
    btndivLearn.classList.remove('open');
  }
});

btnLearn.addEventListener('click', () => {
  ApplyLearning();
  btndivLearn.classList.remove('open');
  localStorage.setItem("space", JSON.stringify(space));
});


var renderId;
var tickinId;
var nodegraph = [];


async function tactRender() {

  space.nodes.forEach((element, index) => {
    const node = nodegraph[index];
    const r = NodeState[index][0] * 199 + 56;
    node.attr('body/fill', `rgb(${r}, ${r}, 56)`);
  });


  if (selectStart) {
    const NodeSpace = space.nodes.find(N => N.id === selectStart.model.id);
    if (NodeSpace.type === 1) {
      let index = space.nodes.indexOf(NodeSpace);
      labeloutput.textContent = NodeState[index][0].toFixed(2);
      labelsensitivity.textContent = NodeState[index][1].toFixed(2);
      labelplasticity.textContent = NodeState[index][2].toFixed(2);
    };
  } else {
    labeloutput.textContent = '_';
    labelsensitivity.textContent = '_';
    labelplasticity.textContent = '_'; 
  };

  if (selectLink) {
    const linkSpace = space.links.find(L => L.id === selectLink.model.id);
    if (linkSpace.type === 4) {
      let index = space.links.indexOf(linkSpace);
      labelWeight.textContent = LinkState[index][0].toFixed(5);
      labelTarget.textContent = LinkState[index][1].toFixed(5);
      labelTrack.textContent = LinkState[index][2].toFixed(5);
    };
  } else {
      labelWeight.textContent = '_';
      labelTarget.textContent = '_';
      labelTrack.textContent = '_';
  };

  labelTime.textContent = 'Time tick: ' + timeDiff + ' mc';

  renderId = setTimeout(tactRender, 60);
};

let actuators = {};
let sensors = {};

function inputOutput (){


  for (let node in actuators) {
    actuators[node].value = NodeState[actuators[node].index][0];
  };

  localStorage.setItem("actuators", JSON.stringify(actuators));

  let sensors = JSON.parse(localStorage.getItem('sensors'));
  if (sensors === null) return;

  arrSensor[0].forEach((key, index) => {
    if (key !== key_down) {
      if (sensors[arrSensor[1][index]] !== undefined) { 
        FireSensor(index, sensors[arrSensor[1][index]]);
      };
    }
  });
};

function StartRender() {
  renderId = setTimeout(tactRender, 101);
  tickinId = setInterval(inputOutput, 5);

  actuators = {};
  sensors = {};

  space.nodes.forEach((node, index) => {
    if (node.type === 2) {
      const id = node.setting.id;
      if (id !== '') {
        actuators[id] = {value: 0, index: index};
      };
    };

    if (node.type === 3) {
      const id = node.setting.id;
      if (id !== '') {
        sensors[id] = 0;
      };
    };
  });


  localStorage.setItem("sensors", JSON.stringify(sensors));

  nodegraph = space.nodes.map((item) => {return graph.getCell(item.id);});
};

function StopRender() {
  clearInterval(renderId);
  clearInterval(tickinId);
  
  space.nodes.forEach((element, index) => {
    const node = nodegraph[index];
    if (node != undefined) node.attr('body/fill', `rgb(56, 56, 56)`);
  });


  labeloutput.textContent = '_';
  labelsensitivity.textContent = '_';
  labelplasticity.textContent = '_';

  labelWeight.textContent = '_';
  labelTarget.textContent = '_';
  labelTrack.textContent = '_';

  labelTime.textContent = 'Time tick: -- mc';
};

let keyDownTimer = null;

function KeyDown(event) {
  key_down = event.key;
    arrSensor[0].forEach((key, index) => {
      if (key === event.key) {
        FireSensor(index);
      }
  });
}

document.addEventListener('keydown', event => {
  if (playing && keyDownTimer === null) {
    KeyDown(event);
    keyDownTimer = setInterval(() => {
      KeyDown(event);
    }, 10);
  }
});

document.addEventListener('keyup', event => {
  key_down = null;
  clearInterval(keyDownTimer);
  keyDownTimer = null;
});


openWin.addEventListener ('change', (event) => {

  const nameValue = event.target.value;
  if (nameValue === "null") return;
  
  const childWindow = window.open('./win/'+ nameValue + '.html', 'new_tab');
  var timer = setInterval(function() {
    if (childWindow.closed) {
      clearInterval(timer);
      Object.keys(sensors).forEach(item => { sensors[item] = 0; });
      localStorage.setItem("sensors", JSON.stringify(sensors))
      console.log(' close');
    }
  }, 500);

  event.target.selectedIndex = 0;
});
