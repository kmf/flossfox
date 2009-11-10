var Flossfox = {
    prefs: Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService)
                    .getBranch("extensions.flossfox."),
    
    log: function(msg) {
        if (Flossfox.prefs.getBoolPref("debug")) {
            if (window.console)
                window.console.log("flossfox: " + msg);
            else
                Application.console.log("flossfox: " + msg);
        }
    },
    
    nsUrl: function(spec) {
      var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
      return ios.newURI(spec, null, null);
    },
    
    newTab: function(url) {
        var tab = Application.activeWindow.open(Flossfox.nsUrl(url));
        if (!Flossfox.prefs.getBoolPref("backgroundTabs"))
            tab.focus();
        return false;
    }
};
