const { read } = require("fs");
const { config } = require("process");

function statusCodesToCause(code){
    const statusCodes = {
        "0": "OPC Process initiated",
        "1": "Success",
        "2": "Unable to post to cloud database"    
    }
    
    return statusCodes[code.toString()]
}

function statusCauseToCodes(cause){
    const statusCauses = {
        "Process initiated": 0,
        "Success": 1,
        "Unable to post to cloud database" : 2  
    }

    return statusCodes[cause]

}

function validateStatusOfAllConfigs(arr){
    console.log(arr)
    return false;
}

angular.module('desktopApp', [])
  .controller('indexController', function($scope,$http,$interval) {
    $scope.network = false
    $scope.registration = false
    $scope.config = true
    $scope.loadNetwork = function(){
        // $scope.network_color = 'grey';
        $http.get("http://52.186.151.7/network")
		.then(function (response){
			$scope.jsondata = response.data;
            console.log("status:" + response.status);
            if (response.status == 200){
                $scope.network_color= "green"
                $scope.network_class= "success"
                $scope.network_msg = "Network is up"
            } else{
                $scope.network_color= "red"
                $scope.network_class= "error"
                $scope.network_msg = "Cloud error"
            }
		}).catch(function() {
            $scope.network_color= "red"
            $scope.network_class= "error"
            $scope.network_msg = "Unable to contact to 52.186.151.7"
        });
    }
    $scope.loadClientRegistration = function(){
        var clientId = localStorage.getItem("clientId") || $scope.clientId;
        $scope.clientId = clientId
        $scope.registration_color = localStorage.getItem("registration_color") || 'red';
    }
    $scope.loadConfig = function(){
        var clientId = localStorage.getItem("clientId") || $scope.clientId;
        // $scope.config_color = localStorage.getItem("config_color");
        // $http.get("http://52.186.151.7/exactapi/configs/"+local_config["id"]+"/statuses")
        // $http.get("http://52.186.151.7/exactapi/clients/"+clientId+"/configs")
        // .then(function (response){
        //     console.log(response.status)
        //     if (response.status == 200){
        //         data =response.data
        //         // console.log(data)
        //         var statuses = []
        //         for (let i = 0; i < data.length; i++) {
        //             // console.log(data[i]);
        //             $scope.forms[i].status = statusCodesToCause(data[i].status)
        //             //transform a->b
        //             statuses.push = data[i].status
        //         }
        //         if (validateStatusOfAllConfigs(statuses)){
        //             $scope.config_color = 'green';
        //         }
        //     } else{
        //         // $scope.config_msg = "Something went wrong at js, !200 loadconfig"
        //     } 
            
        //     // other cases of not 200
        // }).catch(function(response) {
        //     console.log("not load  config is called")
        //     // console.log(response.error)
        //     console.log(response)
        //     // console.log(response.data)
        //     // $scope.forms[index].status = data.status

        //     // $scope.config_msg = "Cloud error"
        // });

        $http.get("http://52.186.151.7/exactapi/clients/"+clientId+"/configs")
        .then(function (response){
            if (response.status == 200){
                // delete tmp["id"]
                // delete tmp["clientId"]
                if (!angular.equals($scope.forms, response.data)){ //covers first time forms case
                    // $scope.forms = response.data
                    // load taglists of all forms
                    var statuses = []
                    for (let index = 0; index < $scope.forms.length; index++) {
                        const local_config = $scope.forms[index];

                        $http.get("http://52.186.151.7/exactapi/configs/"+local_config["id"]+"/statuses")
                        .then(function (res){
                            if (res.status == 200){
                                // if ($scope.forms[index]["status"]!==res.data["status"]) {
                                    // console.log($scope.forms[index]["status"])
                                    // console.log(res.data["status"])
                                $scope.forms[index]["status"] = statusCodesToCause(res.data["status"])
                                // }
                                console.log(res.data["status"])
                                statuses = statuses.push(res.data["status"])
                                // console.log(statuses)
                                // console.log(res.data["status"])
                                // }
                                
                            }
                        })
                        // .catch(function(e2) {
                        //     console.error(e2)
                        // });
                    }
                    console.log("statusses")
                    // console.log(statuses)
                    if (validateStatusOfAllConfigs(statuses)){
                        $scope.config_color = 'green';
                    }
                }
                
            } else{
                console.error(response.status)
            }
        }).catch(function(e) {
            console.error(e)
        });

    }

    // all load are for loading colored buttons only!

    $scope.submitClientRegistration = function(){
        if ($scope.clientId){
            localStorage.setItem("clientId", $scope.clientId)
            // console.log($scope.clientId)
            $http.get("http://52.186.151.7/exactapi/clients/"+$scope.clientId+"/configs")
            .then(function (response){
                if (response.status == 200){
                    $scope.registration_color= "green"
                    $scope.registration_msg = "Saved"
                    $scope.registration_class = "success"

                    localStorage.setItem("clientId",$scope.clientId);
                    localStorage.setItem("registration_color","green")
                } else{
                    $scope.registration_color= "red"
                    localStorage.setItem("registration_color","green")
                    $scope.registration_msg = "Cloud error"
                    $scope.registration_class = "error"
                }
            }).catch(function(response) {
                $scope.registration_color= "red" //404
                localStorage.setItem("registration_color","green")
                $scope.registration_msg = "ClientID doesn't exist on remote machine"
                $scope.registration_class = "error"
            });
            $scope.loadClientRegistration()
        }
    }

    var formObj = {
        "OPC_SERVER_USER": "",
        "OPC_SERVER_PASS": "",
        "OPC_SERVER_HOST": "localhost",
        "OPC_SERVER_PROGID": "",
        "OPC_SERVER_CLSID": "",
        "TAG_PREFIX": "",
        "SUBSCRIBE_INTERVAL": 60000
        // "taglist": ""
    }
    $scope.addForm = function(){
        $scope.forms.push(formObj)
    }
    $scope.addTag = function(index){
        $scope.forms[index].tags.push({"dataTag":""})
    }
    $scope.displayForm = function(){
        var clientId = localStorage.getItem("clientId") || $scope.clientId;

        $http.get("http://52.186.151.7/exactapi/clients/"+clientId+"/configs")
        .then(function (response){
            if (response.status == 200){
                // delete tmp["id"]
                // delete tmp["clientId"]
                if (!angular.equals($scope.forms, response.data)){ //covers first time forms case
                    $scope.forms = response.data
                    // load taglists of all forms

                    for (let index = 0; index < $scope.forms.length; index++) {
                        const local_config = $scope.forms[index];
                        $http.get("http://52.186.151.7/exactapi/configs/"+local_config["id"]+"/tags")
                        .then(function (res){
                            if (res.status == 200){
                                $scope.forms[index]["tags"] = res.data 
                            }
                        })
                        $http.get("http://52.186.151.7/exactapi/configs/"+local_config["id"]+"/statuses")
                        .then(function (res){
                            if (res.status == 200){
                                $scope.forms[index]["status"] = statusCodesToCause(res.data["status"])
                                if (res.data["status"]==0){
                                    $scope.forms[index].status_class = "info"
                                } else if (res.data["status"]==1){
                                    $scope.forms[index].status_class = "success"
                                } else if (res.data["status"]==2){
                                    $scope.forms[index].status_class = "error"
                                }
                                
                            }
                        })
                        // .catch(function(e2) {
                        //     console.error(e2)
                        // });
                    }
                }
                
            } else{
                console.error(response.status)
            }
        }).catch(function(e) {
            console.error(e)
        });
    }
    $scope.setForm = function(configId, formindex){
        var clientId = localStorage.getItem("clientId") || $scope.clientId;

        var formcopy = angular.copy($scope.forms[formindex])
        delete formcopy["id"]
        delete formcopy["$$hashKey"]
        delete formcopy["status"]
        
        // status
        //transform b ->a
        // formcopy["status"] = statusCauseToCodes[formcopy["status"]]
        // formcopy["taglist"] = formcopy["taglist"].split('\n')

        var tags = formcopy["tags"]
        delete formcopy["tags"]
        console.log("in set form")
        // saving opc configs
        $http.post('http://52.186.151.7/exactapi/configs/update?where={"id":"'+configId+'"}',json=formcopy)
        // $http.post('http://52.186.151.7/validate-client-config/'+clientId,JSON.stringify($scope.forms[0]))
        .then(function (response){
            if (response.status == 200){
                console.log("saved!")
                // $scope.forms[0].config_msg = 'Saved!'

                // $scope.forms[formindex].status = 'Saved'
            } else{
                // console.error("Form save")
                console.error(response.status)
                // $scope.config_msg[0] = "Cloud error ",reponse.status 
                // $scope.forms[formindex].status = 'Cloud error'
            }
        }).catch(function(response) {
            console.error(response)
        });

        // saving tags (taglist)
        // $http.post('http://52.186.151.7/exactapi/configs/update?where={"id":"'+configId+'"}',json=formcopy)
        // .then(function (response){
        //     if (response.status == 200){
        //         // console.log("saved!")
        //         $scope.forms[0].config_msg = 'Saved!'
        //     } else{
        //         // console.error("Form save")
        //         console.error(response.status)
        //         $scope.config_msg[0] = "Cloud error ",reponse.status 
        //     }
        // }).catch(function(response) {
        //     console.error(response)
        // });
    }

   
    $scope.registration_color = 'red';
    $scope.network_color = 'red';
    $scope.config_color = 'red';

    //display once
    $scope.displayForm();
    $scope.loadNetwork();
    $scope.loadClientRegistration();
    $scope.loadConfig();
    
    //every 5 seconds
    $interval(function(){
        $scope.loadNetwork();
        // $scope.loadClientRegistration();
        // if ($scope)
        $scope.loadConfig();
        if ($scope.network_color=='green'){
            // console.log($scope.form)
            // if (!$scope.form){
                // $scope.displayForm();
            // }
            // logic of form reload after network is installed
        }
    }, 5000);

  });