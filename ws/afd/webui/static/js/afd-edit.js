var AFDEDITHC = function() {
    return {
        ableAll : function(obj, class_filter) {
            console.log("ableAll", obj, class_filter);
            if (obj.type == "radio") {
                if (obj.value == "yes") {
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
        }
    }; /* End returned object. */
}();
