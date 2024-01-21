const { app, BrowserWindow } = require('electron')
const glob = require('glob')
const fs = require("fs")
const request = require('request')
const propertiesReader = require('properties-reader');
const exec = require('child_process').exec;
const properties = propertiesReader(__dirname+"\\config.properties");

Array.prototype.equals = function(arr2) {
  return (
    this.length === arr2.length && this.every((value, index) => value === arr2[index])
  );
};


const downloadFile=(file)=>{
  return new Promise((resolve, reject)=>{
    let fp = fs.createWriteStream(__dirname+"/"+file);
    try{
      const suffix = properties.get("CONFIG_URL_PREFIX").split("/").pop()
      let stream =request.get(properties.get("CONFIG_URL_PREFIX").replace(suffix, "pulse-files")+"/updates/da/"+file).pipe(fp)
      stream.on('finish', function () {
        fs.appendFileSync(__dirname+"/test.txt",JSON.stringify(file)+"\n");
        resolve() 
      });
    } catch(err){
      fs.appendFileSync(__dirname+"/test.txt",JSON.stringify(err.toString())+"\n");
      reject()
    }
  })
}


function update_manage(){
  fs.appendFileSync(__dirname+"/test.txt", "checking for update\n");

  const suffix = properties.get("CONFIG_URL_PREFIX").split("/").pop()
  request.get(properties.get("CONFIG_URL_PREFIX").replace(suffix, "pulse-files")+"/updates/da/version.json", function optionalCallback(err, httpResponse, body){
      let local_version = 2.0
      let glob_version = 2.01

      try{
        glob_version = parseFloat(JSON.parse(body)["version"])
        fs.appendFileSync(__dirname+"/test.txt", "cloud version: ");
        fs.appendFileSync(__dirname+"/test.txt", glob_version+"\n");
      } catch (err){
        fs.appendFileSync(__dirname+"/test.txt", err.toString()+"\n");
      }

      try{
        local_version  = parseFloat(JSON.parse(fs.readFileSync(__dirname+"/version.json", "utf-8"))["version"])
        fs.appendFileSync(__dirname+"/test.txt", "local version: ");
        fs.appendFileSync(__dirname+"/test.txt", local_version+"\n");
      } catch(err){
        //file doesn't exist locally ; then pull
        console.error(err)
      }

      if (glob_version>local_version){
          fs.appendFileSync(__dirname+"/test.txt", "Updating"+"\n");

          let files_to_pull = JSON.parse(body)["files"]
          files_to_pull.push("version.json")
          
          Promise.all(files_to_pull.map(f=>downloadFile(f))).then(function(){
            app.relaunch();
            app.exit(); 
          }).catch(function(error){
			      fs.appendFileSync(__dirname+"/test.txt", error);
            // win.loadFile('index.html')
		      })
      }
  })
}

setInterval(update_manage,60000);


function createWindow () {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      preload: __dirname+"/preload.js"
    }
  })
  win.setMenuBarVisibility(false)
  const fileName = "index.html";
  win.loadFile(fileName);
}


app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {app.quit()}
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = new BrowserWindow({
      width: 1000,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        preload: __dirname+"/preload.js"
      }
    })

    win.setMenuBarVisibility(false)
    // Check the DRIVER property for "ua"
    const driver = properties.get("DRIVER");
    const fileName = driver.includes("ua") ? "ua_index.html" : "index.html";
    win.loadFile(fileName);
  }
})