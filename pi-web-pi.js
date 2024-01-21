const fs = require('fs')
const propertiesReader = require('properties-reader')
const fetch = require('node-fetch')
const setch = require('sync-fetch')
const mqtt = require('mqtt')
let pf
let tag_web_mapping = {};
Array.prototype.chunk = function (n) {
    if (!this.length) {
        return [];
    }
    return [this.slice(0, n)].concat(this.slice(n).chunk(n));
};
// 30 seconds reconnect for websockets
const reconnectInterval = 1 * 1000 * 60


console.log(">>>>>>>>>>>>>>>>>>>",process.env);
let properties;
try {
    properties = propertiesReader(__dirname + "/config.properties")
} catch (e) {
    console.error("config.properties not found")
    console.error(e)
    process.exit()
}

if (process.argv.length != 4) {
    console.log(process.argv)
    console.error("Pass csv file along")
    process.exit()
}
const on_connect_mqtt = () => { console.log("Connected to ES-MQTT") }

const load_data = () => {
    return new Promise((resolve, reject) => {
        const uri = config_url + "/ingestconfigs/" + configId + "/tags";
        fetch(uri)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch data from URL');
                }
                return response.json();
            })
            .then(data => {
                const store = data.map(item => ({ WebId: item.address, Name: item.dataTagId }));
                resolve(store);
            })
            .catch(error => reject(error));
    });
};

const setStatus = (statusCode) => {
    let URI = config_url + "/ingestconfigs/" + configId + "/statuses"
    const status = setch(URI, {
        headers: {
            "Content-Type": "application/json"
        }
    }).json()

    URI = config_url + '/statuses/update?where={"id":"' + status["id"] + '"}'
    //console.log(URI)

    const metadata = setch(URI, {
        method: "POST",
        body: JSON.stringify({ "status": statusCode.toString(), "time": (+new Date() + 2 * 19800), "cached": false }),
        headers: {
            "Content-Type": "application/json"
        }
    })
    console.log(metadata.status)
    if (metadata.status == 200) {
        console.log("setstatus-check", statusCode, metadata.status)
        return 1
    }
    return 0
}
const post_message_remote = (msg) => {
    try {
        let mwebId = msg.WebId
        let tag = tag_web_mapping[msg.WebId]
        let timestamp = Date.parse(msg.Value.Timestamp)
        let value = msg.Value.Value
        if (typeof (value) !== "number") {
            console.log(tag,value);
            
            if (msg.Value.Value !== null){
                value = msg.Value.Value.Value
            }

                
        }
        let payload = { "v": value, "t": timestamp }
        let topic = clientId + "/" + configId+"/" + pf + tag
        client.publish(topic, JSON.stringify(payload))
	    console.log(topic, payload)
    } catch (e) {
        console.log(msg, e)
     console.log(pf)
    }
}

const connection_resolver = (response) => {
    return new Promise((resolve, reject) => {
        if (response.status !== 200) {
            console.error("Error connecting to " + response.url + " : " + response.status)
            reject()
        }
        //console.log("Connected to "+  response.url)
        resolve(response)
    })
}

let LastKnown = {}

const clientId = process.argv[2]
const configId = process.argv[3]
const config_url = properties.get("CONFIG_URL_PREFIX")
const batch = properties.get("BATCH")
pf = properties.get("TAG_PREFIX")

let tagmappings = [];
let client;
load_data()
    .then(filedata => {
        tagmappings = filedata;
        tagmappings.forEach(tagm => {
            tag_web_mapping[tagm['WebId']] = tagm['Name'];
        });
        let uri = properties.get('SITE_ROOT');
        console.log("site-root",uri);

        return fetch(uri, { headers: { 'Authorization': 'Basic ' + properties.get('AUTH_TOKEN') } });
    })
    .then((response) => {
        connection_resolver(response)
        let uri = properties.get("CONFIG_URL_PREFIX") + "/ingestconfigs/" + properties.get("CONFIG_ID")
        console.log("es-root",uri);
        return fetch(uri)
    })
    .then((response) => {
        connection_resolver(response)
        client = mqtt.connect(properties.get("ES_MQTT_ROOT"))
        client.on('connect', on_connect_mqtt)
        const webIds = tagmappings.map((tag) => { return tag.WebId })
        const webIdsChunks = webIds.chunk(batch)

        setStatus(0)
        let status_count = 0

        setInterval(() => {
            webIdsChunks.forEach(function (webIdChunk, index) {
                setTimeout(function () {
                    const qp = properties.get("SITE_ROOT") + "/streamsets/value?webid=" + webIdChunk.join("&webid=")
                    fetch(qp, { headers: { 'Authorization': 'Basic ' + properties.get("AUTH_TOKEN") } })
                        .then(response => connection_resolver(response))
                        .then(response => response.json())
                        .then((data) => {
                            if (data.Errors) {
                                console.log(data.Errors)
                            } else {
                                data.Items.forEach((datum) => {
                                    if (status_count === 0) {
                                        try {
                                            console.log("status set to online")
                                            setStatus(1)
                                        } catch (error) {
                                            console.log(error)
                                        }
                                    }
                                    status_count = (status_count + 1) % (data.Items.length * webIdsChunks.length)
					post_message_remote(datum)
                                })
                            }
                        })
                        .catch((err) => console.log(err))
                }, index * 200);
            });
        }, reconnectInterval)
    })
    .catch((err) => console.error(err))