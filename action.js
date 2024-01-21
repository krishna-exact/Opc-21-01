var exec = require("child_process").exec,
  child;
var fs = require("fs");
var kill = require("tree-kill");
const { log } = require("util");
var logfilename = __dirname + "\\" + "opc-logs.txt";


// console.log("program application", firstword);



start = (form) => {
  var command_to_run = form.OPC_SERVER_DRIVER
  console.log("form.id",form.OPC_SERVER_DRIVER);
  
  console.log(`${command_to_run}`);

  clearInfo(`${form.id}`);
  fs.closeSync(fs.openSync(logfilename, "w"));

  var clientId = localStorage.getItem("clientId");

  console.log(command_to_run + " " + clientId + " " + form.id);
  var process = exec(command_to_run + " " + clientId + " " + form.id, {
    cwd: __dirname,
  });
  console.log(process);

  fs.closeSync(fs.openSync(__dirname + "\\" + form.id + ".pid", "w"));
  fs.appendFileSync(
    __dirname + "\\" + form.id + ".pid",
    process.pid.toString() + "\n"
  );

  process.stderr.on("data", function (data) {
    fs.appendFileSync(logfilename, data);
    sendBackInfo(data, form.id);
  });

  process.stdout.on("data", function (data) {
    fs.appendFileSync(logfilename, data);
    sendBackInfo(data, form.id);
  });
};

test = (form) => {
  clearInfo(form.id);
  fs.closeSync(fs.openSync(logfilename, "w"));
  var clientId = localStorage.getItem("clientId");
  if (form.tags.length > 0) {
    console.log(
      command_to_run +
        " " +
        clientId +
        " " +
        "TEST" +
        " " +
        form.OPC_SERVER_USER +
        " " +
        form.OPC_SERVER_PASS +
        " " +
        form.OPC_SERVER_HOST +
        " " +
        form.OPC_SERVER_PROGID +
        " " +
        form.OPC_SERVER_CLSID +
        " " +
        form.TAG_PREFIX +
        " " +
        form.DATA_TAG_TYPE +
        " " +
        form.SUBSCRIBE_INTERVAL +
        " " +
        form.tags[0]["dataTagId"] +
        " " +
        form.tags[0]["PROG_ID_PREFER"]
    );
    var process = exec(
      command_to_run +
        " " +
        clientId +
        " " +
        "TEST" +
        " " +
        form.OPC_SERVER_USER +
        " " +
        form.OPC_SERVER_PASS +
        " " +
        form.OPC_SERVER_HOST +
        " " +
        form.OPC_SERVER_PROGID +
        " " +
        form.OPC_SERVER_CLSID +
        " " +
        form.TAG_PREFIX +
        " " +
        form.DATA_TAG_TYPE +
        " " +
        form.SUBSCRIBE_INTERVAL +
        " " +
        form.tags[0]["dataTagId"] +
        " " +
        form.tags[0]["PROG_ID_PREFER"],
      { cwd: __dirname }
    );
    console.log(process);
    fs.appendFileSync(
      __dirname + "\\" + "test.pid",
      process.pid.toString() + "\n"
    );

    process.stderr.on("data", function (data) {
      fs.appendFileSync(logfilename, data);
      sendBackInfo(data, form.id);
    });

    process.stdout.on("data", function (data) {
      fs.appendFileSync(logfilename, data);
      sendBackInfo(data, form.id);
    });
  } else {
    sendBackInfo("Please add atleast one tag in the form");
  }
};
stop = (form) => {
  var command_to_run = form.OPC_SERVER_DRIVER
  console.log(command_to_run);


  var firstword = command_to_run.split(" ")[0];

  var stop_command = `taskkill /f /im ${firstword}.exe`;
  console.log(">>",stop_command);
  var x = exec(stop_command);
 
  var msg = `killed all instances of ${firstword}`;
  sendBackInfo(msg);

  
};

stopAll = (forms) => {
  for (const form of forms) {
    console.log("Current form:", form.OPC_SERVER_DRIVER);
    var command_to_run = form.OPC_SERVER_DRIVER
    console.log(command_to_run);
  
  
    var firstword = command_to_run.split(" ")[0];
  
    var stop_command = `taskkill /f /im ${firstword}.exe`;
    var x = exec(stop_command);
    console.log("stopping all");
    console.log(stop_command, x);
    var msg = "\nKilled all instances of OPC server";
    sendBackInfo(msg);
  }
 
};

clearInfo = (configId) => {
  document.getElementById(`${configId}`).innerHTML = "";
};



sendBackInfo = (data, configId) => {
  const timestamp = formatDate(new Date());

  const element = document.getElementById(`${configId}`);
  if (element) {
    element.innerHTML =
      (element.innerHTML || "") + "<br>" + "Logs: " + timestamp + " " + data;
  }
};

// Function to format date in the desired format
function formatDate(date) {
  const options = {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}
