const dotenv = require('dotenv')
const { config } = require('process')
const fetch = require('sync-fetch')
const { constants } = require('buffer')
const { OPCUAClient, makeBrowsePath, SecurityPolicy, MessageSecurityMode, AttributeIds, resolveNodeId, TimestampsToReturn } = require("node-opcua");
const async = require("async");
const { time } = require('console')
const mqtt = require('mqtt');
const { mixin } = require('lodash');
const { type } = require('os');
const fetchp = require('node-fetch')
const fs = require('fs');

dotenv.config({ path: './config.properties' })

console.log(process.env.CONFIG_URL_PREFIX, "is base url")

function typeTransform(data, tag, itemsToScale) {
    try {
        let op = itemsToScale[tag]

        if (data === true) {
            return 1
        } else if (data === false) {
            return 0
        } else if (data === null) {
            return null
        } else {
            if (tag in itemsToScale) {
                let scaled_data = ((data / op["div"]) * op["mul"] - op["sub"] + op["add"])
                return scaled_data.toFixed(5)
            }
            else {
                return data.toFixed(5)
            }
        }
    }
    catch (e) {
        console.log("typeTransform error", e)
        return null
    }
}

let flag = true;

function notHaveInitVariables(dict) {
    if ((dict.MQTT_URL == "") || (dict.CONFIG_URL_PREFIX == "")) {
        return 1
    }
    return 0
}

function notHaveConfigVariables(dict) {
    console.log(dict.TAG_PREFIX, "is prefix")
    console.log(dict.pubLookup.length, "tags found")
    console.log(dict.SUBSCRIBE_INTERVAL, "is subscribe interval")
    if (!dict.pubLookup || !dict.SUBSCRIBE_INTERVAL) {
        return 1
    }
    return 0
}

function getConfig(dict) {

    try {
        let URI = dict.CONFIG_URL_PREFIX + "/clients/" + dict.CLIENT_ID + "/ingestconfigs/" + dict.CONFIG_ID;
        const response = fetch(URI, {
            headers: glob_headers
        });
        const config = response.json();
        URI = dict.CONFIG_URL_PREFIX + "/ingestconfigs/" + dict.CONFIG_ID + "/tags";
        const response2 = fetch(URI, {
            headers: glob_headers
        });
        const tags = response2.json();
        config.pubLookup = tags;
        return config;
    }
    catch {
        flag = false
    }
}

function yyyymmdd() {
    function twoDigit(n) { return (n < 10 ? '0' : '') + n; }
    var now = new Date();
    return '' + now.getFullYear() + twoDigit(now.getMonth() + 1) + twoDigit(now.getDate());
}

function setStatus(dict) {
    try {
        let URI = dict.CONFIG_URL_PREFIX + "/ingestconfigs/" + dict.CONFIG_ID + "/statuses"
        const status = fetch(URI, {
            headers: glob_headers,
            timeout: 10000
        }).json()
        URI = dict.CONFIG_URL_PREFIX + '/statuses/update?where={"id":"' + status["id"] + '"}'
        const metadata = fetch(URI, {
            method: "POST",
            body: JSON.stringify({ "status": process.env.STATUS || 0, "time": (+new Date() + 2 * 19800), "requireRestart": false }),
            headers: glob_headers,
            timeout: 10000,
        })
        if (metadata.status == 200) {
            return 1
        }
        return 0
    }
    catch {
        console.log("Failed to get or update status due to server slow or connectivity issue")
        console.log('Using the local cache file to proceed further')
        return 1
    }
}

function padZero(num) {
    return num < 10 ? "0" + num : num;
}

//------------------main program-----------------------

let glob_headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": ""
}

if (notHaveInitVariables(process.env)) {
    console.error("Config.properties incomplete")
    process.exit()
}

var tagsValue = {}
console.log(process.env.CONFIG_URL_PREFIX.replace("/exactapi", "/opc-network"))
process.env.CLIENT_ID = process.argv[2]
process.env.CONFIG_ID = process.argv[3]
process.env.STATUS = 0
let filenamejson = process.env.CLIENT_ID + process.env.CONFIG_ID + ".json"
function createjson() {
    const configdata = getConfig(process.env);
    const jsonData = JSON.stringify(configdata, null, 4) + "\n";
    fs.writeFile(filenamejson, jsonData, (err) => {
        if (err) {
            console.error(err);
        } else {
            console.log("OPCconnect configuration file created successfully");
        }
    })
    fs.readFile(filenamejson, (err, data) => {
        if (err) {
            console.error(err);
        }
        const jsonData = JSON.parse(data);
        const oldKey = "taglist";
        const newKey = "pubLookup";

        if (jsonData.hasOwnProperty(oldKey)) {
            jsonData[newKey] = jsonData[oldKey];
            delete jsonData[oldKey];
        }

        fs.writeFile(filenamejson, JSON.stringify(jsonData, null, 4) + "\n", (err) => {
            if (err) {
                console.error(err);
            }
        });
    });
}
async function getData() {
    try {
        const res = await fetchp(process.env.CONFIG_URL_PREFIX.replace("/exactapi", "/opc-network"), {
            "headers": {
                "withCredentials": true
            }
        });
        createjson();
        let jsonData;
        try {
            jsonData = await res.json();
        } catch (error) {
            console.error("Error parsing JSON from server response:", error);
        }
        return jsonData;
    } catch {
        try {
            const config = await new Promise((resolve, reject) => {
                fs.readFile(filenamejson, 'utf8', (err, data) => {
                    if (err) reject(err);
                    let jsonData;
                    try {
                        jsonData = JSON.parse(data);
                    } catch (error) {
                        reject(new Error("Error parsing JSON from local file"));
                    }
                    resolve(jsonData);
                });
            });
            return config;
        } catch (error) {
            console.error('Local config file does not exist');
            process.exit(1);
        }
    }

}
getData()
    .then(data => {
        try {
            glob_headers["Authorization"] = data.id
            console.log("Authenticated")
        } catch (e) {
            console.log("Unautenticated!")
            console.log("Restarting")
        }

        if (process.argv.length > 2) {
            process.env.CLIENT_ID = process.argv[2]
            process.env.CONFIG_ID = process.argv[3]
            process.env.STATUS = 0
            if (!setStatus(process.env)) {
                console.error("STATUS not initiated, retry START")
            }
            let config = getConfig(process.env)
            if (flag === false) {
                config = data
            }
            if (config.length < 1) {
                console.error("Config not created at cloud")
                process.exit()
            }
            if (notHaveConfigVariables(config)) {
                console.error("Config incomplete, exitting.")
                process.exit()
            }

            for (param in config) {
                if (typeof (config[param]) == "object") {
                    process.env[param] = JSON.stringify(config[param])
                } else {
                    process.env[param] = config[param].toString()
                };
            }
        }
        else {
            console.error("Run time arguments incomplete")
            process.exit()
        }
        const endpointUrl = process.env.OPC_SERVER_HOST;

        let clientContext = {
            "endpoint_must_exist": false,
            "securityPolicy": SecurityPolicy[process.env.OPC_SERVER_SECURITY_POLICY],
            "securityMode": MessageSecurityMode[process.env.OPC_SERVER_SECURITY_MODE]
        }

        const client = OPCUAClient.create(clientContext);


        let the_session, the_subscription;
        async.series([
            function (callback) {
                client.connect(endpointUrl, function (err) {
                    if (err) {
                        console.log("---------cannot connect to endpoint------------:", endpointUrl);
                    } else {
                        console.log("**********Successfully Connected to OPC-UA**********");
                    }
                    callback(err);
                });
            },
            function (callback) {
                if (process.env.OPC_SERVER_PASS) {
                    client.createSession(function (err, session) {
                        if (err) {
                            return callback(err);
                        }
                        the_session = session;
                        callback();
                    });
                } else {
                    client.createSession(function (err, session) {
                        if (err) {
                            return callback(err);
                        }
                        the_session = session;
                        callback();
                    });
                }
            },
            function (callback) {
                const subscriptionOptions = {
                    maxNotificationsPerPublish: 5000,
                    publishingEnabled: true,
                    requestedLifetimeCount: 100,
                    requestedMaxKeepAliveCount: 10
                };
                the_session.createSubscription2(subscriptionOptions, (err, subscription) => {
                    if (err) {
                        return callback(err);
                    }
                    the_subscription = subscription;
                    callback();
                });
            },
            function (callback) {
                const monitoringParamaters = {
                    samplingInterval: 30000,
                    discardOldest: true,
                    queueSize: 1,
                    requestedPublishingInterval: 30000
                };

                let itemsToMonitor = []
                let itemsToScale = {}
                tags = JSON.parse(process.env.pubLookup)
                tags.forEach(function (tag) {

                    if (tag["scalefactor"]) {
                        itemsToScale[tag["dataTagId"]] = tag["scalefactor"];
                    }
                })

                console.log("items to scale", itemsToScale)
                if (process.env.OPC_SERVER_ADDRESS_PREFIX === undefined) {
                    process.env.OPC_SERVER_ADDRESS_PREFIX = "";
                }
                if (process.env.OPC_SERVER_ADDRESS_SUFFIX === undefined) {
                    process.env.OPC_SERVER_ADDRESS_SUFFIX = "";
                }
                if (process.env.TAG_PREFIX === undefined) {
                    process.env.TAG_PREFIX = "";
                }
                console.log("address prefix is ", process.env.OPC_SERVER_ADDRESS_PREFIX)
                console.log("address suffix is ", process.env.OPC_SERVER_ADDRESS_SUFFIX)
                console.log("tag prefix is ", process.env.TAG_PREFIX,'<br>')

                tags.forEach(function (tag) {

                    try {
                        if (tag["address"]) {
                            address = tag["address"]
                            itemsToMonitor.push({
                                attributeId: AttributeIds.Value,
                                nodeId: "ns=" + process.env.OPC_SERVER_NAMESPACE + ";" + process.env.OPC_SERVER_PREFERENCE + "=" + address
                            })
                        } else {
                            tag = tag["dataTagId"]

                            itemsToMonitor.push({
                                attributeId: AttributeIds.Value,
                                nodeId: "ns=" + process.env.OPC_SERVER_NAMESPACE + ";" + process.env.OPC_SERVER_PREFERENCE + "=" + process.env.OPC_SERVER_ADDRESS_PREFIX + tag + process.env.OPC_SERVER_ADDRESS_SUFFIX
                            })
                        }

                    } catch (error) {
                        console.log("tag addition error", error)

                    }
                })

                the_subscription.monitorItems(
                    itemsToMonitor,
                    monitoringParamaters,
                    TimestampsToReturn.Both, function (err, mItems) {
                        if (err) {
                            console.log("Exited, error while monitoritems")
                            console.log(err)
                        }
                        mItems.on("changed", function (monitoredItem, dataValue, index) {
                            try {
                                tagsValue[tags[index].dataTagId] = typeTransform(dataValue.value.value, tags[index].dataTagId, itemsToScale)
                            } catch (e) {
                                console.log("unable to set value during tagsValue mapping")
                                console.log(tags[index], dataValue)
                                console.log(e)
                                return
                            }
                        });
                    })
                    console.log("-----------------Subscription Added--------------------");
                }
        ],
            function (err) {
                if (err) {
                    console.log("failure in ua callback", err);
                    //process.exit(1)
                } else {
                    console.log("done!");
                }
            });
    })
    .catch(err => {
        console.error(err);
    });

function createLogEntry(tagsValue) {
    console.log(tagsValue);
   
    const fpayload = [];
    const ts = +new Date();

    for (const key in tagsValue) {
        var payload = JSON.stringify({ "n": process.env.TAG_PREFIX + key, "v": tagsValue[key], "t": ts })
        fpayload.push(payload);
    }

    const fileBody = fpayload.join('\r\n') + '\r\n';
    const now = new Date();
    const filename = process.env.CLIENT_ID + '_' + process.env.CONFIG_ID + '_log_' + now.getFullYear() + padZero(now.getMonth() + 1) + padZero(now.getDate()) + '_' + padZero(now.getHours()) + '.txt';

    fs.appendFile('./logs/' + filename, fileBody, 'utf8', function (err) {
        if (err) throw err;
    });
}

// function saveDataToCloudAndLog(tagsValue) {
//     console.log(tagsValue);
//     try {
//         const IURI = process.env.CONFIG_URL_PREFIX.replace("/exactapi", "/ingest/") + process.env.CLIENT_ID + "/" + process.env.CONFIG_ID;
//         const ingest = fetch(IURI, {
//             method: "POST",
//             body: JSON.stringify(tagsValue),
//             headers: {},
//             timeout: 10000,
//         });

//         if (ingest.status === 204) {
//             // var payload = JSON.stringify({ "n": process.env.TAG_PREFIX + key, "v": tagsValue[key], "t": ts })
//             // console.log(JSON.stringify({"v": tagsValue[key], "t": ts }));
//             console.log('Data of', process.env.name, 'saved to the cloud successfully at', new Date(), 'with status code', ingest.status);
//             if (Object.keys(tagsValue).length !== 0) {
//                 process.env.STATUS = 1;
//                 setStatus(process.env);
//             }
//         } else {
//             console.log('Data saving failed for', process.env.name, 'Cloud offline. Status code', ingest.status);
//             console.log('Storing data to forward at', new Date());

//             createLogEntry(tagsValue);
//         }
//     } catch (error) {
//         console.log('Data saving to the cloud error');
//         console.log('Storing data to forward at', new Date());

//         createLogEntry(tagsValue);
//     }
// }



let consecutiveSameBodyCount = 0;
let lastSavedBody = null;

function areTagValuesEqual(tagsValue1, tagsValue2) {
    return JSON.stringify(tagsValue1) === JSON.stringify(tagsValue2);
}

function saveDataToCloudAndLog(tagsValue) {
    console.log(tagsValue);

    // Check if the current body has the same values as the last saved body
    if (lastSavedBody && areTagValuesEqual(tagsValue, lastSavedBody)) {
        consecutiveSameBodyCount++;
    } else {
        consecutiveSameBodyCount = 0;
    }

    if (consecutiveSameBodyCount >= 1) {
        console.log('Exiting process because two consecutive tagvalues have the same values.');
        process.exit(); 
    }

    try {
        const IURI = process.env.CONFIG_URL_PREFIX.replace("/exactapi", "/ingest/") + process.env.CLIENT_ID + "/" + process.env.CONFIG_ID;
        const ingest = fetch(IURI, {
            method: "POST",
            body: JSON.stringify(tagsValue),
            headers: {},
            timeout: 10000,


        });

        if (ingest.status === 204) {
            lastSavedBody = { ...tagsValue }; // Update last saved body
            console.log('Data of', process.env.name, 'saved to the cloud successfully at', new Date(), 'with status code', ingest.status);
            if (Object.keys(tagsValue).length !== 0) {
                process.env.STATUS = 1;
                setStatus(process.env);
            }
        } else {
            console.log('Data saving failed for', process.env.name, 'Cloud offline. Status code', ingest.status);
            console.log('Storing data to forward at', new Date());

            createLogEntry(tagsValue);
        }
    } catch (error) {
        console.log('Data saving to the cloud error');
        console.log('Storing data to forward at', new Date());

        createLogEntry(tagsValue);
    }
}



setInterval(function () {
    // Call the function and pass tagsValue to it
    saveDataToCloudAndLog(tagsValue);
}, 30000);


