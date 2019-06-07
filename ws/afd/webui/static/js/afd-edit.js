"use strict";
var AFDEDIT = function() {
    return {
        /** urlBase. */
        urlBase : "/",

        /** urlView. */
        urlHc : "afd/hc",

        /**
         * 
         */
        ableAll : function(obj, class_filter) {
            console.log("ableAll", class_filter);
            if (obj.type == "radio") {
                if (obj.value == "yes" && obj.checked == true) {
                    $("." + class_filter).removeAttr("disabled");
                } else {
                    $("." + class_filter).attr("disabled", true);
                }
            } else {
                if (obj.checked == true) {
                    $("." + class_filter).removeAttr("disabled");
                } else {
                    $("." + class_filter).attr("disabled", true);
                }
            }
        },

        updateHostconfig : function() {
            console.log("updateHostconfig");
            let alias = $("#alias-list")[0].value;
            if (alias == null || alias == "") {
                console.log("nothing to do.");
                return;
            }
            let ol = $("#alias-list option");
            let aliasList = [];
            for (let i = 0; i < ol.length; i++) {
                aliasList.push(ol[i].value);
            }
            let formData = {
                order : aliasList,
                data : {}
            };
            formData["data"][alias] = {};
            $.each($(".filter"), function(i, obj) {
                if (obj.type == "radio") {
                    if (obj.checked) {
                        formData["data"][alias][obj.id.split("-", 1)[0]] = obj.value;
                    }
                } else {
                    formData["data"][alias][obj.id] = obj.value;
                }
            });
            formData["data"][alias]["alias"] = alias;
            delete formData["data"][alias]["alias-list"];
            console.log(formData);
            $.ajax({
                type : "POST",
                url : AFDEDIT.urlBase + AFDEDIT.urlHc + "/update",
                dataType : 'JSON',
                data : JSON.stringify(formData),
                contentType : "application/json; charset=utf-8",
                traditional : true,
                success : function(data, status, jqxhr) {
                    AFDEDIT.readHostconfig(alias);
                },
                error : function(jqxhr, status, errStr) {
                    console.log(jqxhr, status, errStr);
                }
            });
        },

        /**
         * Exec general AFD command, handle ajax call.
         */
        readHostconfig : function(alias) {
            console.log("readHostconfig: " + alias);
            let afdUrl;
            if (!alias) {
                afdUrl = AFDEDIT.urlBase + AFDEDIT.urlHc;
            } else {
                afdUrl = AFDEDIT.urlBase + AFDEDIT.urlHc + "/" + alias;
            }
            $.ajax({
                type : "GET",
                url : afdUrl,
                success : function(data, status, jqxhr) {
                    console.log(status, "alias:", alias);
                    AFDEDIT.changeHostconfigAliasList(data["order"], alias);
                    if (alias != null && alias != "") {
                        AFDEDIT.changeHostconfigFormValues(data["data"], alias);
                    } else {
                        AFDEDIT.changeHostconfigFormValues(data["data"], data["order"][0]);
                    }
                },
                error : function(jqxhr, status, errStr) {
                    console.log(status, errStr);
                }
            });
        },

        changeHostconfigAliasList : function(aliasList, selectedAlias) {
            console.log("changeHostconfigAliasList: " + aliasList + " - " + selectedAlias);
            let data = "";
            for (let i = 0; i < aliasList.length; i++) {
                if (aliasList[i] == selectedAlias) {
                    data = data + "<option selected>" + aliasList[i] + "</option>";
                } else {
                    data = data + "<option>" + aliasList[i] + "</option>";
                }
            }
            $("#alias-list").html(data);
        },

        changeHostconfigFormValues : function(data, selectedAlias) {
            console.log("changeHostconfigFormValues: " + selectedAlias);
            if (data[selectedAlias]["keep_connected_direction"] != "send"
                    && data[selectedAlias]["keep_connected_direction"] != "fetch") {
                data[selectedAlias]["keep_connected_direction"] = "both";
            }
            if (data[selectedAlias]["dupcheck_timeout"] == 0) {
                data[selectedAlias]["dupcheck_flag"] = "disable";
            } else {
                data[selectedAlias]["dupcheck_flag"] = "enable";
            }
            $.each(data[selectedAlias], function(k, v) {
                let objList = $("[name=" + k + "]");
                if (objList.length > 0) {
                    if (objList[0].type == "radio") {
                        objList = $("#" + k + "-" + v);
                        if (objList.length > 0) {
                            objList[0].checked = true;
                        }
                    } else {
                        objList[0].value = v;
                    }
                }
            });
            AFDEDIT.ableAll($("#host_switch_enable")[0], "host_switch");
            AFDEDIT.ableAll($("#dupcheck_flag-enable")[0], "dupcheck");
        },

        moveHostconfigAlias : function(direction) {
            console.log("moveHostconfigAlias", direction);
            let alias = $("#alias-list")[0].value;
            if (!alias) {
                return;
            }
            let aliasList = $("#alias-list option");
            console.log("aliasList -------");
            $.each(aliasList, function(i, v) {
                console.log(v.value);
            });
            let is = 0;
            let ie = aliasList.length;
            if (direction == -1) {
                is = 1;
            } else if (direction == 1) {
                ie = ie - 1;
            }
            for (let i = is; i < ie; i++) {
                console.log("test", i, aliasList[i].value)
                if (alias == aliasList[i].value) {
                    if (direction) {
                        console.log("move", i, aliasList[i].value);
                        let buf = aliasList[i];
                        aliasList[i] = aliasList[i + direction];
                        aliasList[i + direction] = buf;
                    } else {
                        aliasList.splice(i, 1);
                    }
                    $("#alias-list").html(aliasList);
                    break;
                }
            }
            console.log("aliasList -------");
            $.each(aliasList, function(i, v) {
                console.log(v.value);
            });
        }

    }; /* End returned object. */
}();

(function() {
    $(document).ready(function() {
        console.log(window.location);
        if (window.location.pathname.endsWith("afd-hcedit.html")) {
            if (window.location.search != "") {
                let al = window.location.search.substring(1).split(",");
                AFDEDIT.readHostconfig(al[0]);
            } else {
                AFDEDIT.readHostconfig(null);
            }
        } else {
            alert("Why is there no DIR_CONFIG editor???");
        }
    });
})();
