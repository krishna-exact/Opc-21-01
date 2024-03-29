const { Console } = require("console");
const { app, BrowserWindow } = require("electron");
const { read } = require("fs");
var exec = require("child_process").exec,
  child;
const { config } = require("process");
const propertiesReader = require("properties-reader");
const properties = propertiesReader(__dirname + "\\config.properties");
let restart_time = Number(properties.get("RESTART_TIME"));
var responseTime = 0;
let network_status = 1;
let restart = 0;
if (isNaN(restart_time) || restart_time === 0) {
  restart_time = 1; //
}


// Define an AngularJS module

// console.log(".....app>>",app);
console.log(properties.get("MQTT_URL"));
console.log(__dirname + "config.properties");

function statusCodesToCause(code) {
  const statusCodes = {
    0: "Connecting",
    1: "Success",
    2: "Unable to upload to database",
    3: "Program Stopped",
  };
  return statusCodes[code.toString()];
}

function statusCauseToCodes(cause) {
  const statusCauses = {
    Connecting: 0,
    Success: 1,
    "Unable to upload to database": 2,
    "Program Stopped": 3,
  };

  return statusCodes[cause];
}

function lookKeyToIndex(obj, key, match) {
  for (var i = 0; i < obj.length; i++) {
    if (obj[i][key] == match) {
      return i;
    }
  }
  return -1;
}

function validateStatusOfAllConfigs(arr) {
  // console.log("every")
  // console.log(arr.every( (val, i, arr) => val === 1 )  )
  return arr.every((val, i, arr) => val === 1); // true
}

function validateStaleOfAllConfigs(arr) {
  return false;
}

function isStaleTimestamp(ts, configId) {
  // right now - status timestamp
  console.log("time: ", restart_time);
  var tmp = (+new Date() - new Date(ts)) / 60000;
  console.log(configId, ts, tmp);
  // console.log("stale")
  return tmp > restart_time ? true : false;
}

function csvJSON(csv) {
  var lines = csv.split("\n");

  var result = [];

  var headers = lines[0].split(",");

  for (var i = 1; i < lines.length; i++) {
    var obj = {};
    var currentline = lines[i].split(",");

    for (var j = 0; j < headers.length; j++) {
      obj[headers[j].replace("\r", "")] = currentline[j].replace("\r", "");
    }

    result.push(obj);
  }

  return JSON.stringify(result); //JSON
}

function hasTagsColumnAndNonEmpty(tags) {
  return tags.filter(function (tag) {
    if (tag["tags"]) {
      tag["dataTagId"] = tag["tags"];
      delete tag["tags"];
      return tag;
    }
  });
}

function authenticate($http, $scope) {
  return $http({
    url: properties.get("CONFIG_URL_PREFIX") + "/Users/login",
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
    data:
      '{"email":"' +
      properties.get("API_AUTH_USERNAME") +
      '","password":"' +
      properties.get("API_AUTH_PASSWORD") +
      '"}',
    method: "POST",
  });
}
let restart_interval = Number(properties.get("RESTART_INTERVAL"));
if (isNaN(restart_interval) || restart_interval === 0) {
  restart_interval = 1; //
}

let max_attempts = Number(properties.get("MAX_ATTEMPTS"));
if (isNaN(max_attempts) || max_attempts === 0) {
  max_attempts = 5; //
}
let backoff_interval = Number(properties.get("BACKOFF_INTERVAL"));
if (isNaN(backoff_interval) || backoff_interval === 0) {
  backoff_interval = 5; //
}

var attempts = 1;
var inBackoffPeriod = false;
var backoffEndTime = 0;

function manageRestart($http, $scope,  configId, index,form) {
  
  var clientId = localStorage.getItem("clientId") || $scope.clientId;
  var currentTime = Date.now();
  var lastRestartTime =
    parseInt(localStorage.getItem(configId + "_last_restart_time")) || 0;

  $scope.forms.forEach(function (form) {
    if (form.id === configId) {
      var unitsId = form.unitsId;
      // console.log("Matched Unit ID:", unitsId);
      var divElement = document.getElementById(`${configId}+unit`);

      if (unitsId) {
        divElement.textContent = "unitId: " + unitsId;
        divElement.style.color = "black";
      } else {
        divElement.textContent = "Please link this to unitsId from pulse";
        divElement.style.color = "red";
      }
    }
  });

  if (inBackoffPeriod && currentTime < backoffEndTime) {
    console.log("Backoff period time");
    return;
  } else if (inBackoffPeriod && currentTime >= backoffEndTime) {
    console.log("Backoff period over, resetting attempts");
    attempts = 1;
    inBackoffPeriod = false;
  }

  if (attempts > max_attempts && !inBackoffPeriod) {
    console.log(
      "Maximum restart attempts reached. Backing off for " +
        backoff_interval +
        " minutes."
    );
    inBackoffPeriod = true;
    backoffEndTime = currentTime + backoff_interval * 60 * 1000;
    return;
  }

  if (currentTime - lastRestartTime < restart_interval * 60 * 1000) {
    console.log("Restart interval not elapsed yet.");
    return;
  }

  $http
    .get(
      properties.get("CONFIG_URL_PREFIX") +
        "/ingestconfigs/" +
        configId +
        "/statuses"
    )

    .then(function (res) {
      if (res.status == 200) {
        console.log(
          "configId",
          configId,
          "requiredRestart",
          res.data["requireRestart"],
          "status",
          res.data["status"],
          "url",
          properties.get("CONFIG_URL_PREFIX") +
            "/ingestconfigs/" +
            configId +
            "/statuses"
        );

        if (res.data["status"] === 1) {
          network_status = 1;
        } else network_status = 0;
        if (res.data["requireRestart"]) {
          restart = 1;
          console.log("Required Restart Detected");
          $http
            .post(
              properties.get("CONFIG_URL_PREFIX") +
                '/statuses/update?where={"ingestconfigId":"' +
                configId +
                '"}',
              (json = { requireRestart: false })
            )
            .then(function (response) {
              if (response.status == 200) {
                console.log("Required Restart Requested");
                $scope.restart(form);
                console.log("Restarted-Attempts:", attempts);
                localStorage.setItem(
                  configId + "_last_restart_time",
                  Date.now()
                );
                attempts++;
              } else {
                console.error(response.status);
              }
            })
            .catch(function (response) {
              console.error(response);
            });
        } else if (
          res.data["time"] &&
          isStaleTimestamp(res.data["time"], configId)
        ) {
          console.log("Stale condition detected");
          if (attempts <= max_attempts) {
            console.log("Restarting");
            $scope.restart(form);
            console.log("Restarted- Attempts:", attempts);
            localStorage.setItem(configId + "_last_restart_time", Date.now());
            attempts++;
          } else {
            console.log(
              "Maximum restart attempts reached. Backing off for " +
                backoff_interval +
                " minutes."
            );
            inBackoffPeriod = true;
            backoffEndTime = currentTime + backoff_interval * 60 * 1000;
          }
        } else {
          restart = 0;
          console.log("No restart required.");
        }
        var d = new Date();
        var epochTime = d.getTime();
        console.log(
          clientId + "/" + configId + "/" + configId + "_network_status"
        );
        console.log(clientId + "/" + configId + "/" + configId + "_restart");
        mq.publish(
          clientId + "/" + configId + "/" + configId + "_network_status",
          JSON.stringify({ t: epochTime, v: network_status })
        );
        mq.publish(
          clientId + "/" + configId + "/" + configId + "_restart",
          JSON.stringify({ t: epochTime, v: restart })
        );

        $scope.forms[index]["status"] = statusCodesToCause(res.data["status"]);
        $scope.forms[index].status_class =
          res.data["status"] == 1 ? "success" : "error";
      }
    })
    .catch(function (e2) {
      console.error(e2);
    });
}

angular
  .module("desktopApp", [])
  .controller("indexController", function ($scope, $sce, $http, $interval, $window) {
    $scope.network = false;
    $scope.registration = true;
    $scope.config = false;

    $scope.dataTagIds = [];
    $scope.TagsRender = {};

    $scope.TsRender = {};

    // authenticate($http, ()=>{
    $http.defaults.headers.common["Authorization"] = $scope.auth_token;
    // })


   
    

    $scope.onMessageCallback = function (topic, msg) {
      // console.log("updates tags")
      var dataTagId = topic.split("/")[2];
      // console.log(dataTagId)
      // console.log(msg.toString())["v"]
      let d = new Date(JSON.parse(msg.toString())["t"]);

      $scope.TagsRender[dataTagId] = JSON.parse(msg.toString())["v"];
      // $scope.TsRender[dataTagId] =  d.getDate()  + "-" + (d.getMonth()+1) + " "  +d.getHours() + ":" + d.getMinutes();
      $scope.TsRender[dataTagId] = d.toLocaleString("en-US"); //d.getDate()  + "-" + (d.getMonth()+1) + " "  +d.getHours() + ":" + d.getMinutes();
      // console.log("onmessage")
      // console.log($scope[dataTagId])
    };

    mq = mqtt.connect(properties.get("MQTT_URL"), {
      keepalive: 120,
      username: properties.get("MQTT_AUTH_USERNAME"),
      password: properties.get("MQTT_AUTH_PASSWORD"),
    });
    mq.on("message", $scope.onMessageCallback);

    $scope.start = function (form) {
      console.log("index.js driver",form.OPC_SERVER_DRIVER);
      console.log(form.id);
      console.log("Calling start");
      start(form);
      localStorage.setItem(form.id, true);
    };

    $scope.stop = function (form) {
      stop(form);

      localStorage.removeItem(form.id);
      $http
        .post(
          properties.get("CONFIG_URL_PREFIX") +
            '/statuses/update?where={"ingestconfigId":"' +
            form.id +
            '"}',
          (json = { status: 3 })
        )
        .then(function (response) {
          console.log(response.status);
          if (response.status == 200) {
            console.log("status went to stop");
            // $scope.forms[0].config_msg = 'Saved!'
            // $scope.forms[formindex].status = 'Saved'
            console.log(response.data.count);
            if (response.data.count == 0 || response.status != 200) {
              console.log("Not found configs, in post statuses update");
              $http
                .post(
                  properties.get("CONFIG_URL_PREFIX") +
                    "/ingestconfigs/" +
                    form.id +
                    "/statuses",
                  (json = { status: 0 })
                )
                .then(function (response) {
                  if (response.status == 200) {
                    console.log("created status");
                  } else {
                    console.error(response.status);
                  }
                })
                .catch(function (response) {
                  console.error(response);
                });
            }
          } else {
            // console.error("Form save")
            console.error(response.status);
            // $scope.config_msg[0] = "Cloud error ",reponse.status
            // $scope.forms[formindex].status = 'Cloud error'
          }
        })
        .catch(function (e2) {
          console.error(e2);
        });
      // var index = lookKeyToIndex($scope.forms, "id", configId)
      // $scope.forms[index]["status"] = "Program Stopped"

      // $scope.forms[index].status_class = "error"
      // $scope.config_color = 'red';
    };

    $scope.restart = function (form) {
      console.log("restart configId:", form);
      console.log("Calling stop");
      stop(form);
      localStorage.removeItem(form.id);
      $http
        .post(
          properties.get("CONFIG_URL_PREFIX") +
            '/statuses/update?where={"ingestconfigId":"' +
            form.id +
            '"}',
          (json = { status: 3 })
        )
        .then(function (response) {
          console.log(response.status);
          if (response.status == 200) {
            console.log("updated status for stop");
            // $scope.forms[0].config_msg = 'Saved!'
            // $scope.forms[formindex].status = 'Saved'
            // console.log(response.data.count)
            console.log("created status");
            $scope.start(form);
            //console.log("restart done")
          } else if (response.data.count == 0 || response.status != 200) {
            console.log("Not found configs, in post statuses update");
            $http
              .post(
                properties.get("CONFIG_URL_PREFIX") +
                  "/ingestconfigs/" +
                  form.id +
                  "/statuses",
                (json = { status: 0 })
              )
              .then(function (response) {
                if (response.status == 200) {
                  console.log(response.status);
                } else {
                  console.error(response.status);
                }
              })
              .catch(function (response) {
                console.error(response);
              });
          } else {
            // console.error("Form save")
            console.error(response.status);
            // $scope.config_msg[0] = "Cloud error ",reponse.status
            // $scope.forms[formindex].status = 'Cloud error'
          }
        })
        .catch(function (e2) {
          console.error(e2);
        });
      // var index = lookKeyToIndex($scope.forms, "id", configId)
      // $scope.forms[index]["status"] = "Program Stopped"

      // $scope.forms[index].status_class = "error"
      // $scope.config_color = 'red';
    };

    $scope.stopAll = function (forms) {
      // console.log("stopping all::::::::::::::", configId);
      var clientId = localStorage.getItem("clientId") || $scope.clientId;
      $http
        .get(
          properties.get("CONFIG_URL_PREFIX") +
            "/clients/" +
            clientId +
            "/ingestconfigs"
        )
        .then(function (response) {
          if (response.status == 200) {
            console.log("got all configs to delete!");
            for (var i = 0; i < response.data.length; i++) {
              localStorage.removeItem(response.data[i]["id"]);
            }
            stopAll(forms);
          } else {
            console.error(response.status);
          }
        })
        .catch(function (response) {
          console.error(response);
        });
    };

    $scope.addCSV = function (form) {
      if (document.getElementById("file").files.length == 0) {
        console.log("no files");
        return;
      }
      console.log("fileame");
      // if (f)
      var f = document.getElementById("file").files[0],
        r = new FileReader();
      console.log(f.name);

      // resetting array
      // document.getElementById('file').files = ""
      // document.getElementById("csvChoose").innerHTML = f.name;

      if (!f.name.endsWith(".csv")) {
        alert(f.name + " is not a CSV file");
        return;
      }

      r.onloadend = function (e) {
        var data = e.target.result;
        // console.log("csv data")

        try {
          var taglist = JSON.parse(csvJSON(data));
          // console.log(taglist)

          taglist = hasTagsColumnAndNonEmpty(taglist);
          if (taglist.length > 0) {
            $http
              .post(
                properties.get("CONFIG_URL_PREFIX") +
                  "/ingestconfigs/" +
                  form.id +
                  "/tags",
                (json = taglist)
              )
              .then(function (response) {
                if (response.status == 200) {
                  console.log("saved!");
                  // $scope.forms[0].config_msg = 'Saved!'
                  // $scope.forms[formindex].status = 'Saved'
                  // console.log(form.newTag)
                  form.tags.concat(taglist);
                  // form.tags.push({"dataTagId":form.newTag, "ingestconfigId": form.id})
                } else {
                  // console.error("Form save")
                  console.error(response.status);
                  // $scope.config_msg[0] = "Cloud error ",reponse.status
                  // $scope.forms[formindex].status = 'Cloud error'
                }
              })
              .catch(function (response) {
                console.error(response);
              });
          } else {
            alert(
              "CSV must contain `tags` column and value should not be empty"
            );
          }
        } catch (err) {
          console.log("Internal error: CSV Parsing");
          console.log(err);
          // alert("CSV Par: Internal Error")
        }
        // console.log(data)
        //send your binary data via $http or $resource or do anything else with it
      };

      r.readAsBinaryString(f);
    };

    $scope.lget = function (arg) {
      return localStorage.getItem(arg);
    };

    $scope.test = function (form) {
      console.log(form);
      test(form);
    };

    

   
  
  
    
    


    

    $scope.loadTags = function(form) {
      $scope.tagSearchQuery = ''; // Reset the search query when loading new tags
  
      var clientId = localStorage.getItem("clientId") || $scope.clientId;
      const local_config = form;
      console.log(clientId + "/" + local_config["id"]);
  
      $http.get(properties.get("CONFIG_URL_PREFIX") + "/ingestconfigs/" + local_config["id"] + "/tags?ts=" + (+new Date()).toString())
          .then(function(res) {
              if (res.status == 200) {
                  form.tags = res.data;
                  var prefix = form.TAG_PREFIX;
                  form.tags.forEach((tag_el) => {
                      mq.subscribe(clientId + "/" + local_config["id"] + "/" + prefix + tag_el.dataTagId);
                  });
              }
          });
  };


 

  
  

 
  
 
  




$scope.filteredTags = function(form, query) {
  // Check if form.tags is defined and is an array, if not, return an empty array
  if (!form || !Array.isArray(form.tags)) {
    return [];
  }

  var filteredTags = []; // Array to hold filtered tags

  if (!query) {
    // No search query, just add a 'highlighted' property that matches 'dataTagId'
    form.tags.forEach(function(tag) {
      tag.highlighted = $sce.trustAsHtml(tag.dataTagId);
      filteredTags.push(tag); // Add all tags if there is no query
    });
  } else {
    // Filter and highlight tags based on the search query
    var regex = new RegExp('(' + preg_quote(query) + ')', 'gi');
    form.tags.forEach(function(tag) {
      if (tag.dataTagId.toLowerCase().includes(query.toLowerCase())) {
        var highlighted = tag.dataTagId.replace(regex, '<span class="highlight">$1</span>');
        tag.highlighted = $sce.trustAsHtml(highlighted);
        filteredTags.push(tag); // Only add tags that match the query
      }
    });
  }

  return filteredTags; // Return the array of filtered tags
};

function preg_quote(str) {
  return (str + '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}




  

    $scope.loadConfig = function ($http) {
      var clientId = localStorage.getItem("clientId") || $scope.clientId;

      $http
        .get(
          properties.get("CONFIG_URL_PREFIX") +
            "/clients/" +
            clientId +
            "/ingestconfigs"
        )
        .then(function (response) {
          if (response.status == 200) {
            // > Deals with config green light/button only
            if (!angular.equals($scope.forms, response.data)) {
              //covers first time forms case
              // console.log("first time")
              var urlprefix =
                properties.get("CONFIG_URL_PREFIX") + "/ingestconfigs/";
              var urlsuffix = "/statuses?ts=" + (+new Date()).toString();
              Promise.all(
                response.data.map((u) =>
                  $http.get(urlprefix + u["id"] + urlsuffix)
                )
              )
                .then((responses) =>
                  Promise.all(responses.map((res) => res.data))
                )
                .then((texts) => {
                  // FORM PERFECTIONS
                  var statuses = texts.map((x) => x["status"]);

                  // var statuses = texts.map(x => JSON.parse(x)["status"]);
                  // assuming status is must!!!! for each config
                  // VIMP
                  if (statuses.length == 0) {
                    $scope.config_color = "red";
                  } else if (validateStatusOfAllConfigs(statuses)) {
                    // console.log(statuses)
                    console.log("all valid status");
                    $scope.config_color = "green";
                  } else {
                    $scope.config_color = "red";
                  }
                });
            }

            // > Deals with individual config status
            if ($scope.forms && $scope.forms.length > 0) {
              for (let index = 0; index < $scope.forms.length; index++) {
                // const local_config = $scope.forms[index];
                // removed from here
                // console.log("managing restart-----")
                // manageRestart($http, $scope, local_config["id"])
                manageRestart($http, $scope, $scope.forms[index]["id"], index,$scope.forms[index]);
                //var clIds = [];
                //for (var i = 0; i < $scope.forms.length; i++) {
                //clIds.push($scope.forms[i].id);
                //}
              }
            }
          } else {
            console.error(response.status);
          }
        })
        .catch(function (e) {
          console.error(e);
        });
    };

  









$scope.searchInLogs = function(configId, typedWords) {
  var logsElement = angular.element(document.getElementById(configId));

  var logsContent = logsElement.text(); // Use .text() to get plain text
  // logsContent = logsContent.replace(/Logs:/g, '<span class="logs">Logs:</span>');

  logsContent = logsContent.replace(/Logs:/g, '<br>Logs:');

  // Highlight background color for typed characters
  if (typedWords) {
    var escapedTypedWords = typedWords.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Escape special characters
    var highlightedLogsContent = logsContent.replace(new RegExp('(' + escapedTypedWords + ')', 'gi'), '<span style="background-color: yellow;">$1</span>');

    highlightedLogsContent = highlightedLogsContent.replace(/Logs:/g, 'Logs:');

    logsElement.html('<span>' + highlightedLogsContent + '</span>');
  } else {
    logsContent = logsContent.replace(/<br>Logs:/g, '<br>Logs:');

    logsElement.html(logsContent);
  }
};



    $scope.copyLogs = function (configId) {


      var logsContent = angular
        .element(document.getElementById(configId))
        .text();


      // Use the Clipboard API to copy the text
      navigator.clipboard
        .writeText(logsContent)
        .then(function () {
          // Inform the user that the text has been copied (optional)
          alert("Logs copied to clipboard!");
        })
        .catch(function (error) {
          // Handle any errors (optional)
          console.error("Error copying text: ", error);
        });
    };

    // $scope.restartButton = function () {

    //     console.log("restart clicked");
    //     app.relaunch();
    //     app.exit();
    //   };

    // Define a controller within the module
    $scope.copyToClipboard = function (configId) {
      console.log("copy to clip board wala:::", configId);
      var dynamicPathElement = angular.element(
        document.getElementById("dynamic-path")
      );
      var textArea = document.createElement("textarea");
      textArea.value = dynamicPathElement.text();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("Copy");
      textArea.remove();
      alert("Path copied to clipboard!");
    };

    $scope.fetchDynamicPath = function () {
      var username =
        window.process && window.process.env && window.process.env.USERPROFILE
          ? window.process.env.USERPROFILE.split("\\")[2]
          : "";
      var path = `C:\\Users\\${username}\\AppData\\Roaming\\node-opcua-default-nodejs\\Config\\PKI\\trusted\\certs`;

      var dynamicPathElement = document.getElementById("dynamic-path");
      dynamicPathElement.textContent = path;
      dynamicPathElement.style.display = "block";
    };

    $scope.togglePasswordVisibility = function () {
      var passwordInput = document.getElementById("password-input");
      var eyeIcon = document.querySelector(".toggle-password i");

      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        eyeIcon.classList.remove("fa-eye-slash");
        eyeIcon.classList.add("fa-eye");
      } else {
        passwordInput.type = "password";
        eyeIcon.classList.remove("fa-eye");
        eyeIcon.classList.add("fa-eye-slash");
      }
    };

    $scope.toggleCertificatePathVisibility = function () {
      var checkbox = document.getElementById("certificates-checkbox");
      var getCertificateButton = document.getElementById(
        "get-certificate-button"
      );
      var copyPathButton = document.getElementById("copy-path-button");
      var dynamicPathElement = document.getElementById("dynamic-path");

      if (checkbox.checked) {
        getCertificateButton.style.display = "block";
        copyPathButton.style.display = "block";
        dynamicPathElement.style.display = "block"; // Show dynamicPathElement when checkbox is checked
      } else {
        getCertificateButton.style.display = "none";
        copyPathButton.style.display = "none";
        dynamicPathElement.style.display = "none"; // Hide dynamicPathElement when checkbox is unchecked
      }
    };

    // all load are for loading colored buttons only!
    $scope.submitClientRegistration = function () {
      if ($scope.clientId) {
        localStorage.setItem("clientId", $scope.clientId);
        // console.log($scope.clientId)
        $http
          .get(
            properties.get("CONFIG_URL_PREFIX") +
              "/clients/" +
              $scope.clientId +
              "/ingestconfigs"
          )
          .then(function (response) {
            if (response.status == 200) {
              $scope.registration_color = "green";
              $scope.registration_msg = "Valid Client";
              $scope.registration_class = "success";
              localStorage.setItem("clientId", $scope.clientId);
              localStorage.setItem("registration_color", "green");
              $scope.displayForm();
            } else {
              $scope.registration_color = "red";
              localStorage.setItem("registration_color", "red");
              $scope.registration_msg = "Cloud error";
              $scope.registration_class = "error";
            }
          })
          .catch(function (response) {
            $scope.registration_color = "red"; //404
            localStorage.setItem("registration_color", "red");
            $scope.registration_msg =
              "ClientID doesn't exist on remote machine";
            $scope.registration_class = "error";
          });
      }
    };

    var formObj = {
      name: "name",
      OPC_SERVER_USER: "",
      OPC_SERVER_PASS: "",
      OPC_SERVER_HOST: "localhost",
      OPC_SERVER_PROGID: "",
      OPC_SERVER_NAMESPACE: "",
      TAG_PREFIX: "",
      SUBSCRIBE_INTERVAL: 60000,
    };
    $scope.addForm = function () {
      $scope.forms.push(formObj);
    };

    $scope.addTag = function (form) {
      // console.log("form print>>>", form);
      if (form.unitsId) {
        var unitId = form.unitsId;
        console.log("unitId form>>>>>>", form.name, unitId);
        if (form.newTag) {
          var capturedNewTag = form.newTag;
          var equipment_url =
            properties.get("CONFIG_URL_PREFIX") +
            "/units/" +
            unitId +
            "/equipment?filter={%22where%22:{%22name%22:%22Unassigned%22}}";
          $http
            .get(equipment_url)
            .then(function (response) {
              var equipmentId; // Declare equipmentId here
              console.log(".then >>>>", response.status);
              if (response.status == 200 && response.data.length == 0) {
                $http
                  .post(
                    properties.get("CONFIG_URL_PREFIX") +
                      "/units/" +
                      unitsId +
                      "/equipment",
                    (json = { name: "Unassigned", equipment: "Unassigned" })
                  )
                  .then(function (response) {
                    equipmentId = response.data.id;
                    console.log("EquipmentId created: ", equipmentId);
                  });
              } else if (response.status == 200 && response.data.length >= 1) {
                equipmentId = response.data[0].id;
                console.log("EquipmentId Found: ", equipmentId);
              }

              if (equipmentId) {
                $http
                  .post(
                    properties.get("CONFIG_URL_PREFIX") +
                      "/units/" +
                      unitId +
                      "/tagmeta",
                    (json = {
                      dataTagId: form.TAG_PREFIX + capturedNewTag,
                      description: "Unassigned",
                      equipmentName: "Unassigned",
                      equipmentType: "Unassigned",
                      equipmentId: equipmentId,
                    })
                  )
                  .then(function (response) {
                    console.log("meta response >>>>>", response.data);
                    console.log("tag saved! to the meta");
                    console.log("form.newTag>>>>>>>", capturedNewTag);
                  });
              }
            })
            .catch(function (response) {
              console.error(response);
              form.newTag = "";
            });
        }
      } else {
        $window.alert(
          "Please assign unitId from pulse and reload OPCConnect by CTRL+R"
        );
      }

      if (form.newTag) {
        $http
          .post(
            properties.get("CONFIG_URL_PREFIX") +
              "/ingestconfigs/" +
              form.id +
              "/tags",
            (json = {
              dataTagId: form.newTag.trim(),
              ingestconfigId: form.id,
              address: "",
              scalefactor: "",
            })
          )
          .then(function (response) {
            if (response.status == 200) {
              console.log("tag saved!");

              console.log(form.newTag);
              if (form.newTag) {
                console.log("in inf");
                if (form.hasOwnProperty("tags")) {
                  form.tags.push({
                    dataTagId: form.newTag,
                    ingestconfigId: form.id,
                  });
                } else {
                  form.tags = [
                    { dataTagId: form.newTag, ingestconfigId: form.id },
                  ];
                }
                form.newTag = "";
              }
            } else {
              console.error(response.status);

              form.newTag = "";
            }
          })
          .catch(function (response) {
            console.error(response);
            form.newTag = "";
          });
      }
    };


    $scope.saveTag = function (form, index) {
      
      if (form.tags[index].id && form.tags[index].dataTagId) {
        var updateUrl =
          properties.get("CONFIG_URL_PREFIX") +
          "/tags/update?where=%7B%22id%22:%22" +
          form.tags[index].id +
          "%22%7D";

        var dataToUpdate = {
          dataTagId: form.tags[index].dataTagId.trim(),
          address: form.tags[index].address.trim(),
      };
      

        console.log("dataToUpdate:", dataToUpdate);
        
        $http
          .post(updateUrl, dataToUpdate)
          .then(function (response) {
            if (response.status === 200) {
              console.log("Updated data:", response.data);
            } else {
              console.error("Update failed with status:", response.status);
            }
          })
          .catch(function (error) {
            console.error("Update error:", error);
          });
      }
    };

  

   

    $scope.deleteTag = function (form, index) {
      if (form.tags[index].dataTagId) {
        var delete_url =
          properties.get("CONFIG_URL_PREFIX") +
          "/ingestconfigs/" +
          form.tags[index].ingestconfigId +
          "/tags/" +
          form.tags[index].id;
        $http
          .delete(delete_url)
          .then(function (response) {
            // console.log("inisde delete url>>>>>", delete_url);
            if (response.status == 204) {
              console.log("tag deleted!");
              form.tags.splice(index, 1);
            } else {
              console.error(response.status);
            }
          })
          .catch(function (response) {
            console.error(response);
          });
      }
    };

   

    $scope.editTag = function (tag) {
      tag.editMode = true; // Enable edit mode which makes inputs editable
    };

   

    $scope.displayForm = function () {
      var clientId = localStorage.getItem("clientId") || $scope.clientId;

      $http
        .get(
          properties.get("CONFIG_URL_PREFIX") +
            "/clients/" +
            clientId +
            "/ingestconfigs?ts=" +
            (+new Date()).toString()
        )
        .then(function (response) {
          if (response.status == 200) {
            if (!angular.equals($scope.forms, response.data)) {
              //covers first time forms case
              $scope.forms = response.data;
            }
            $scope.loadConfig($http);
          } else {
            console.error(response.status);
          }
        })
        .catch(function (e) {
          console.error(e);
        });
    };
    $scope.deleteForm = function (index) {
      console.log(index);
      console.log("Calling delete");

      var configId = $scope.forms[index]["id"];

      if (confirm("Do you really want to delete this OPC server?")) {
        if (!configId) {
          $scope.forms.splice(index, 1);
        } else {
          $http
            .delete(
              properties.get("CONFIG_URL_PREFIX") + "/ingestconfigs/" + configId
            )
            .then(function (response) {
              console.log(response.status);
              if (response.status == 200) {
                $scope.forms.splice(index, 1);

                console.log("deleted!");
              } else {
                console.error(response.status);
              }
            })
            .catch(function (response) {
              console.error(response);
            });
        }
      }
    };

    $scope.classConvert = function (x) {
      if (x == "success") {
        return "greencircle";
      } else {
        return "redcircle";
      }
    };
    $scope.setForm = function (configId, formindex) {
      var clientId = localStorage.getItem("clientId") || $scope.clientId;
      var formcopy = angular.copy($scope.forms[formindex]);
      delete formcopy["id"];
      delete formcopy["$$hashKey"];
      delete formcopy["status"];
      delete formcopy["status_class"];
      delete formcopy["config_msg"];
      delete formcopy["taglist"];
      // delete other items here also, beofre submit

      if (formcopy["PROG_ID_PREFER"]) {
        formcopy["PROG_ID_PREFER"] = 1;
      } else {
        formcopy["PROG_ID_PREFER"] = 0;
      }

      formcopy["TAG_PREFIX"] = formcopy["TAG_PREFIX"];
      var tags = formcopy["tags"];
      delete formcopy["tags"];

      //validating the configs received first

      if (configId) {
        // that means need to update form
        console.log("update form");
        // saving opc configs
        $http
          .post(
            properties.get("CONFIG_URL_PREFIX") +
              '/ingestconfigs/update?where={"id":"' +
              configId +
              '"}',
            (json = formcopy)
          )
          .then(function (response) {
            if (response.status == 200) {
              console.log("saved!");
              // $scope.forms[0].config_msg = 'Saved!'
              // $scope.forms[formindex].status = 'Saved'
            } else {
              // console.error("Form save")
              console.error(response.status);
              // $scope.config_msg[0] = "Cloud error ",reponse.status
              // $scope.forms[formindex].status = 'Cloud error'
            }
          })
          .catch(function (response) {
            console.error(response);
          });
      } else {
        // that means new form
        console.log("in new form");
        $http
          .post(
            properties.get("CONFIG_URL_PREFIX") +
              "/clients/" +
              clientId +
              "/ingestconfigs",
            (json = formcopy)
          )
          .then(function (response) {
            if (response.status == 200) {
              // del response.data["id"]
              console.log("saved!");
              console.log(response.data);
              // $scope.forms[0].config_msg = 'Saved!'
              $scope.forms[formindex] = response.data;
            } else {
              // console.error("Form save")
              console.error(response.status);
              // $scope.config_msg[0] = "Cloud error ",reponse.status
              // $scope.forms[formindex].status = 'Cloud error'
            }
          })
          .catch(function (response) {
            console.error(response);
          });
      }
    };

    $scope.unsubscribeTags = function (form) {
      if (form.hasOwnProperty("tags")) {
        console.log("unsubs");
        var tags = form["tags"];
        var prefix = form["TAG_PREFIX"];
        var configId = form.id;
        var clientId = localStorage.getItem("clientId") || $scope.clientId;

        if (prefix && configId && clientId) {
          tags.forEach((tag_el) => {
            mq.unsubscribe(
              clientId + "/" + configId + "/" + prefix + tag_el["dataTagId"]
            );
          });
        } else {
          console.log("Empty form or tags");
        }
      }
    };

    $scope.registration_color = "red";
    $scope.config_color = "red";
    $scope.network_color = "red";
    $scope.network_class = "error";
    $scope.network_msg = "Connecting";

    //display once
    $scope.loadNetwork = function () {
      var clientId = localStorage.getItem("clientId") || "empty";

      var clientNetworkId = "network_clientId" + clientId;

      const start = performance.now();
      $http
        .post(
          properties.get("CONFIG_URL_PREFIX").replace("/exactapi", "") +
            "/opc-network",
          (json = { clientNetworkId: 1 })
        )
        .then(function (response) {
          const end = performance.now();
          responseTime = (end - start) / 10;
          console.log(
            "status:" +
              response.status +
              ", response time: " +
              responseTime.toFixed(1)
          );
          // if (response.status == 200){
          $scope.network_color = "green";
          $scope.network_class = "success";
          $scope.network_msg = "Connected";
          // } else{
          // $scope.network_color= "red"
          // $scope.network_class= "error"
          // $scope.network_msg = "Cloud error"
          // }
        })
        .catch(function (e) {
          const end = performance.now();
          responseTime = end - start;
          if (e.status === 401) {
            $scope.network_msg = "Authenticating...";
            authenticate($http, $scope)
              .then((data) => {
                $scope.auth_token = data.data.id;
                $http.defaults.headers.common.Authorization = $scope.auth_token;
                $scope.network_color = "green";
                $scope.network_class = "success";
                $scope.network_msg = "Connected";
              })
              .catch((err) => {
                if (e.status !== 404) {
                  $scope.network_msg = "Wrong credentials";
                } else if (e.status !== 500) {
                  $scope.network_msg = "Internal Server Error";
                } else if (e.status !== 502) {
                  $scope.network_msg = "Bad Gateway";
                }
              });
          } else {
            $scope.network_color = "red";
            $scope.network_class = "error";
            $scope.network_msg = "Unable to contact cloud";
          }
          console.log(
            "status:" + e.status + ", response time: " + responseTime.toFixed(1)
          );
          // console.log(e)
        });
    };
    $scope.loadNetwork();
    // > Loading network call
    $scope.loadClientRegistration = function () {
      var clientId = localStorage.getItem("clientId") || $scope.clientId;
      $scope.clientId = clientId;
      $scope.registration_color =
        localStorage.getItem("registration_color") || "red";
    };
    $scope.loadClientRegistration();
    // > Loading persistent client registration

    // $scope.loadConfig();
    $scope.displayForm();

    // $scope.loadTags();
    $scope.loadNetwork();
    // > every 5 seconds

    $interval(function () {
      $scope.loadConfig($http);
      var clientId = localStorage.getItem("clientId") || $scope.clientId;
      var d1 = new Date();
      var epochTime1 = d1.getTime();
      $scope.loadNetwork();
      //console.log(clientId + "/opc_health" )
      console.log(clientId + "/response_time");
      //mq.publish(clientId + "/opc_health", JSON.stringify({"t": epochTime,"v": 1  }))
      mq.publish(
        clientId + "/response_time",
        JSON.stringify({ t: epochTime1, v: responseTime.toFixed(1) })
      );
    }, 60000);

    $interval(function () {
    
var d1 = new Date();
var epochTime1 = d1.getTime();
var CONFIG_URL_PREFIX = properties.get("CONFIG_URL_PREFIX");
var userApiUrl = `${CONFIG_URL_PREFIX}/ingestconfigs?q=${epochTime1}`;

var startTime = new Date().getTime();
$http
  .get(userApiUrl, { responseType: "arraybuffer" })
  .then(function (response) {
    var endTime = new Date().getTime();
    var requestTime = endTime - startTime;

    // Calculate download speed in Mbps
    var downloadSpeedMbps =
      (response.data.byteLength * 8) / (requestTime / 1000) / 1024 / 1024; // Adjust unit conversion

    var networkSpeedElement = document.getElementById("network-speed-mbps");

    // Set color based on download speed
    if (downloadSpeedMbps < 2) {
      networkSpeedElement.style.color = "red";
    } else {
      networkSpeedElement.style.color = "green";
    }

    networkSpeedElement.textContent = downloadSpeedMbps.toFixed(2) + " Mbps";
  })
  .catch(function (error) {
    console.error("Error making request:", error);
  });

}, 6000);

 

    $interval(function () {

      const jsonString = fs.readFileSync(
        "C:\\OPCConnect\\resources\\app\\version.json",
        "utf8"
      );

      const jsonData = JSON.parse(jsonString);

      const version = jsonData.version;

      try {
        var divElement = document.getElementById("version-value"); // Get the div element
        divElement.textContent = version;
      } catch (error) {
        var divElement = document.getElementById("version-value"); // Get the div element
        divElement.textContent = "ERROR";
      }

    }, 30000);


    // $interval(function (forms) {
    //   for (const form of $scope.forms) {
      
    //     console.log("kill",form);

    //   }
    //   const findPidCommand = `tasklist | find "${firstword}.exe"`;
    //   exec(findPidCommand, (error, stdout, stderr) => {
    //     if (error && error.code !== 1) {
    //       console.error(`Error executing command: ${error}`);
    //       return;
    //     }

    //     if (stderr) {
    //       console.error(`Error: ${stderr}`);
    //       return;
    //     }

    //     const processes = stdout
    //       .split("\n")
    //       .filter((line) => line.trim() !== "");
    //     if (processes.length === 0) {
    //       console.log(`No processes found with name "${firstword}.exe".`);
    //       return;
    //     }
    //     console.log(`Processes with name containing "${firstword}.exe":`);
    //     processes.forEach((process) => console.log(process));

    //     // Create a list of PIDs
    //     const pids = processes
    //       .map((process) => process.split(/\s+/)[1])
    //       .filter((pid) => pid !== "");
    //     console.log("List of PIDs:", pids);

    //     if (pids.length <= $scope.forms.length*2) {
    //       console.log(`Only ${pids.length} process found. Not killing.`);
    //     } else {
    //       const pidsToKill = pids.slice($scope.forms.length);
    //       const killCommands = pidsToKill.map(
    //         (pid) => `taskkill /f /pid ${pid}`
    //       );

    //       // Execute each taskkill command separately
    //       killCommands.forEach((killCommand, index) => {
    //         exec(killCommand, (killError, killStdout, killStderr) => {
    //           if (killError) {
    //             console.error(
    //               `Error killing process with PID ${pidsToKill[index]}: ${killError}`
    //             );
    //             return;
    //           }

    //           if (killStderr) {
    //             console.error(`Error: ${killStderr}`);
    //             return;
    //           }

    //           console.log(
    //             `Process with PID ${pidsToKill[index]} killed successfully.`
    //           );
    //         });
    //       });
    //     }
    //   });

     
    // }, 30000);
  });
