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

        /**
         * Exec general AFD command, handle ajax call.
         */
        readHostconfig : function(alias) {
            console.log("readHostconfig: " + alias);
            if (alias == null) {
                afdUrl = AFDEDIT.urlBase + AFDEDIT.urlHc;
            } else {
                afdUrl = AFDEDIT.urlBase + AFDEDIT.urlHc + "/" + alias;
            }
            $.ajax({
                type : "GET",
                url : afdUrl,
                success : function(data, status, jqxhr) {
                    console.log(status);
                    AFDEDIT.changeHostconfigAliasList(data["order"], alias);
                    if (alias != null) {
                        AFDEDIT.changeHostconfigFormValues(data["data"], alias);
                    } else {
                        AFDEDIT.changeHostconfigFormValues(data["data"], data["order"][0]);
                    }
                },
                error : function(status, jqxhr) {
                    console.log(status, jqxhr);
                }
            });
        },

        changeHostconfigAliasList : function(aliasList, selectedAlias) {
            console.log("changeHostconfigAliasList: " + aliasList + " - " + selectedAlias);
            data = "";
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
