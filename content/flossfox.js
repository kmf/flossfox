var lastTweet = { "friends": 0, "replies": 0 };
var lastUpdate = { "friends": 0, "replies": 0 };
var tweetTimer = null;
var replyingTo = null;
var badLogin = false;
var activeTab = "friends";

var observer = Components.classes["@mozilla.org/observer-service;1"]
                    .getService(Components.interfaces.nsIObserverService);

var nativeJSON = Components.classes["@mozilla.org/dom/json;1"]
                    .createInstance(Components.interfaces.nsIJSON);

var urlRe = /https?:\/\/[^ ):]+/;
var urliseRe = /(https?:\/\/[^ ):]+|@[a-zA-Z0-9_]+|#(?:\w|[0-9&#;_'æøåÆØÅ])+|spotify:[a-zA-Z0-9:]+)/;

function apiUrl(path) {
    if (!path) path = "";
    var service = Flossfox.prefs.getCharPref("service");
    if (service == "flosspro") return "https://floss.pro/api/" + path;
    return "http://twitter.com/" + path;
}

function userUrl(user) {
    var service = Flossfox.prefs.getCharPref("service");
    if (service == "flosspro") return "https://floss.pro/" + user;
    return "http://twitter.com/" + user;
}

function searchUrl(term) {
    var service = Flossfox.prefs.getCharPref("service");
    term = encodeURIComponent(term);
    if (service == "flosspro") return "https://floss.pro/tag/" + term;
    return "http://search.twitter.com/search?q=" + term;
}

function noticeUrl(user, id) {
    var service = Flossfox.prefs.getCharPref("service");
    if (service == "flosspro") return "https://floss.pro/notice/" + id;
    return "http://twitter.com/" + user + "/status/" + id;
}

$(document).ready(function() {
    $("#tweetbox").keyup(tweetInput);
    $("#tweetbox").keydown(tweetInputVerify);
    //$("#login input[name='save']").click(loginSave);
    $("ul.tabbar li").click(function(event) {
        $("ul.tabbar li").each(function() {
            if (this == event.target) $(this).addClass("active");
            else $(this).removeClass("active");
        });
        updateTabs();
    });
    $("#prefsButton").add("#login button").click(function() {
        window.openDialog('chrome://flossfox/content/prefs.xul', 'Flossfox Preferences',
                          'chrome,titlebar,toolbar,centerscreen,modal');
        $("#login").slideUp("normal");
        startApp();
    });
    updateTabs();
    updateLayout();
    $(window).resize(updateLayout);
    startApp();
});

function startApp() {
    if (tweetTimer !== null) clearTimeout(tweetTimer);
    if (badLogin || !Flossfox.prefs.getCharPref("username") || !getLogin(Flossfox.prefs.getCharPref("username"))) {
        if (badLogin) {
            $("#login .badLogin").show();
            $("#login .noLogin").hide();
        } else {
            $("#login .badLogin").hide();
            $("#login .noLogin").show();
        }
        badLogin = false;
        $("#login").slideDown("normal");
    } else {
        refreshTweets();
    }
}

function tweetInput(event) {
    if (event.keyCode == 13) {
        postUpdate($(event.target).val());
        $(event.target).val("");
    }
    updateInputCount();
}

function tweetInputVerify(event) {
    if ((event.keyCode == 32 || event.keyCode > 40) && getInputCount() >= 140) {
        event.preventDefault();
    }
}

function updateInputCount() {
    var len = 140 - getInputCount();
    if (len < Flossfox.prefs.getCharPref("username").length + 6)
        len = len.toString() + "!";
    $("div.toolbar span.tweet").text(len);
    if (replyingTo && len == 0) replyingTo = null;
}

function getInputCount() {
    var tweet = $("#tweetbox").val();
    tweet = gsub(tweet, urlRe, function(match) { return shortenUrl(match[0]) });
    return tweet.length;
}

function updateLayout() {
    var height = document.documentElement.clientHeight;
    height -= $("ul.tabbar").outerHeight();
    height -= $("div.toolbar").outerHeight();
    $("div.view").height(height);
}

function updateTabs() {
    var old = activeTab;
    $("ul.tabbar li").each(function() {
        var view = $("#" + $(this).attr("id") + "View");
        if ($(this).hasClass("active")) {
            activeTab = $(this).attr("id");
            $(view).show();
        }
        else $(view).hide();
    });
    if (old != activeTab) {
        var last = lastUpdate[activeTab];
        var now = new Date().getTime();
        last += 60000 * Flossfox.prefs.getIntPref("refreshInterval");
        if (last < now) refreshTweets();
    }
}

function url(url, text) {
    var link = $('<a/>');
    link.text(text);
    link.attr("href", url);
    fixUrl(link);
    return link;
}

function fixUrl(url) {
    url.find("a").andSelf().filter("a[href]").click(function(event) {
        return Flossfox.newTab(event.target.href);
    });
    return url;
}

// From Prototype, much stripped:
function gsub(source, pattern, replacement) {
    var result = '', match;
    
    if (!(pattern.length || pattern.source)) {
      replacement = replacement('');
      return replacement + source.split('').join(replacement) + replacement;
    }
 
    while (source.length > 0) {
      if (match = source.match(pattern)) {
        result += source.slice(0, match.index);
        result += replacement(match);
        source = source.slice(match.index + match[0].length);
      } else {
        result += source, source = '';
      }
    }
    return result;
}

function asyncGsub(callback, source, pattern, replacement) {
    function recurse(front, back) {
        var match = back.match(pattern);
        if (match) {
            var newFront = front + back.slice(0, match.index);
            var newBack = back.slice(match.index + match[0].length);
            replacement(match, function(repl) {
                recurse(newFront + repl, newBack);
            });
        } else {
            callback(front + back);
        }
    }
    recurse("", source);
}

function urlise(text, keepExpandedText) {
    return gsub(text, urliseRe, function(url) {
        url = url[1];
        if (url[0] == "@")
            return '@<a resolved="true" href="' + userUrl(url.substring(1)) + '">' + url.substring(1) + '</a>';
        if (url[0] == "#")
            if (url[url.length-1] == ";")
                return url;
            else
                return '#<a resolved="true" href="' + searchUrl(url.substring(1)) + '">' + url.substring(1) + '</a>';
        return '<a href="' + url + '">' + (keepExpandedText ? url : "link") + '</a>';
    });
}

function readableTime(t) {
    t = Math.round(t / 1000);
    if (t < 60)
        return "less than a minute";
    t = Math.round(t / 60);
    if (t < 59)
        return t + " minute" + ((t == 1) ? "" : "s");
    t = Math.round(t / 60);
    if (t < 24)
        return t + " hour" + ((t == 1) ? "" : "s");
    t = Math.round(t / 24);
        return t + " day" + ((t == 1) ? "" : "s");
}

function timeSince(date) {
    var now = new Date();
    return readableTime(now.getTime() - date);
}
  
function resolveUrl(url, callback) {
    var req = new XMLHttpRequest();
    req.open("GET", url);
    req.onreadystatechange = function(event) {
        if (event.target.readyState == 2) {
            var realUrl = event.target.channel.name;
            event.target.onreadystatechange = null;
            event.target.abort();
            callback(realUrl);
        }
    };
    req.send("");
}

function resolveUrls(q) {
    q.find("a").andSelf().filter("a[href][resolved!=true]").each(function() {
        var a = $(this);
        resolveUrl(a.attr("href"), function(url) {
            a.attr("href", url).attr("resolved", "true");
        });
    });
    return q;
}

function tweetToDOM(tweet, disableControls) {
    var item = $('<li class="entry"/>').attr("id", tweet.id);
    item.append($('<img class="portrait" width="48" height="48"/>').attr("src", tweet.user.profile_image_url));
    var entry = $('<div class="entry"/>');
    var header = $('<p class="postinfo"/>');
    header.append(url(userUrl(tweet.user.screen_name), tweet.user.name));
    var extra = $('<p class="like"/>');
    if (tweet.retweet_details) {
        extra.append('retweeted by ');
        extra.append(url(userUrl(tweet.retweet_details.retweeting_user.screen_name),
                            tweet.retweet_details.retweeting_user.name));
        var time = Date.parse(tweet.retweet_details.retweeted_at);
        extra.append(' <span class="time" time="' + time + '"></span> ago');
    } else {
        if (tweet.in_reply_to_status_id) {
            extra.append('in reply to ');
            extra.append(url(noticeUrl(tweet.in_reply_to_screen_name,
                               tweet.in_reply_to_status_id), tweet.in_reply_to_screen_name));
        }
        extra.append(" via ");
        if (tweet.source.charAt(0) == "<")
            extra.append(fixUrl($(tweet.source)));
        else
            extra.append(tweet.source);
        var time = Date.parse(tweet.created_at);
        extra.append(' <span class="time" time="' + time + '"></span> ago');
    }
    entry.append(header);
    var post = fixUrl($('<p class="post"/>').html(urlise(tweet.text)));
    if (!disableControls && Flossfox.prefs.getBoolPref("resolveLinks")) resolveUrls(post);
    entry.append(post);
    if (!disableControls) {
        var toolbar = $('<p class="toolbar"/>');
        var reply = $('<img src="icons/reply.png" title="Reply to this"/>');
        toolbar.append(reply);
        var retweet = $('<img src="icons/retweet.png" title="Retweet this"/>');
        toolbar.append(retweet);
        toolbar.append('<br/>')
        var dm = $('<img src="icons/dm.png" title="Direct message"/>');
        toolbar.append(dm);
        var favourite = $('<img src="icons/favourite' + (tweet.favorited ? "_on" : "") + '.gif" title="Favourite this"/>');
        toolbar.append(favourite);
        entry.append(toolbar);
    }
    entry.append(extra);
    item.append(entry);

    if (!disableControls) {
        reply.click(function(event) { actionReply(tweet, item, event); });
        retweet.click(function(event) { actionRetweet(tweet, item, event); });
        dm.click(function(event) { actionDM(tweet, item, event); });
        favourite.click(function(event) { actionFavourite(tweet, item, favourite, event); });
    }

    return item;
}

function actionReply(tweet, item, event) {
    var box = $("#tweetbox");
    box.val("@" + tweet.user.screen_name + " ");
    box.focus();
    replyingTo = { user: tweet.user.screen_name, id: tweet.id };
    updateInputCount();
}

function actionDM(tweet, item, event) {
    var box = $("#tweetbox");
    box.val("d " + tweet.user.screen_name + " ");
    box.focus();
    replyingTo = null;
    updateInputCount();
}

function actionRetweet(tweet, item, event) {
    var retweet = item.find("p.retweet");
    if (retweet.size()) {
        retweet.remove();
        return;
    }
    retweet = $('<p class="retweet">Retweet? <a class="yes">Yes</a> / <a class="no">No</a></p>');
    retweet.find("a.yes").click(function(event) { retweet.remove(); postRetweet(tweet.id); });
    retweet.find("a.no").click(function(event) { retweet.remove(); });
    item.find("p.like").prepend(retweet);
}

function actionFavourite(tweet, item, fave, event) {
    if (fave.attr("src").indexOf("_on") == -1) {
        fave.attr("src", "icons/favourite_on.gif");
        $.ajax({
            url: apiUrl("favorites/create/" + tweet.id + ".json"),
            type: "POST",
            dataType: "text",
            error: function(request, error) {
                Flossfox.log(error);
            },
            success: function(data) {}
        });
    } else {
        fave.attr("src", "icons/favourite.gif");
        $.ajax({
            url: apiUrl("favorites/destroy/" + tweet.id + ".json"),
            type: "POST",
            dataType: "text",
            error: function(request, error) {
                Flossfox.log(error);
            },
            success: function(data) {}
        });
    }
}

function shortenUrl(url, callback) {
    if (!callback) {
        if (url.length < 18) return url;
        return "http://is.gd/xxxxx";
    }
    if (url.length < 18) {
        callback(url);
    } else {
        $.ajax({
            url: "http://is.gd/api.php",
            data: { longurl: url },
            dataType: "text",
            error: function() { callback(url); },
            success: function(data) { callback(data); }
        });
    }
}

function populateTweets(tweets, tab) {
    $.each(tweets.reverse(), function() {
        $("#" + tab + "Entries").prepend(tweetToDOM(this));
        if (this.id > lastTweet[tab]) lastTweet[tab] = this.id;
    });
    $("#" + tab + "Entries li:gt(" + (Flossfox.prefs.getIntPref("tweetsPerPage")-1) + ")").remove();
    $("span.time").each(function() {
        $(this).text(timeSince(parseInt($(this).attr("time"))));
    });
}

function refreshTweets() {
    badLogin = false;
    var username = Flossfox.prefs.getCharPref("username");
    if (!username) return;
    var login = getLogin(Flossfox.prefs.getCharPref("username"));
    if (!login) return;
    var req = new XMLHttpRequest();
    req.mozBackgroundRequest = true;
    var tab = activeTab;
    var url = apiUrl();
    switch (tab) {
        case "friends":
            url += "statuses/home_timeline";
            break;
        case "replies":
            url += "statuses/replies";
            break;
    }
    url += ".json?count=" + Flossfox.prefs.getIntPref("tweetsPerPage");
    if (lastTweet[tab] > 0) url += "&since_id=" + lastTweet[tab];
    Flossfox.log("ajax: " + url);
    req.open("GET", url, true,
             login.username, login.password);
    req.onreadystatechange = function(event) {
        if (event.target.readyState == 4) {
            var data = nativeJSON.decode(event.target.responseText);
            if (data.error) {
                badLogin = true;
                startApp();
            } else {
                try {
                    populateTweets(data, tab);
                } catch(e) {
                    Flossfox.log("error: " + e);
                }
            }
        }
    };
    req.send("");
    lastUpdate[tab] = new Date().getTime();
    if (tweetTimer !== null) clearTimeout(tweetTimer);
    tweetTimer = setTimeout(refreshTweets, 60000 * Flossfox.prefs.getIntPref("refreshInterval"));
}

function postUpdate(tweet, reply) {
    var username = Flossfox.prefs.getCharPref("username");
    if (!username) return;
    var login = getLogin(Flossfox.prefs.getCharPref("username"));
    if (!login) return;
    $("div.toolbar span.tweet").text("...");
    asyncGsub(function(text) {
        var data = { status: text, source: "flossfox" };
        if (reply) data.in_reply_to_status_id = reply;
        else if (replyingTo) {
            var re = "@" + replyingTo.user;
            if (text.indexOf(re) != -1)
                data.in_reply_to_status_id = replyingTo.id;
            replyingTo = null;
        }
        $.ajax({
            url: apiUrl("statuses/update.json"),
            data: data,
            dataType: "text",
            type: "POST",
            username: login.username,
            password: login.password,
            error: function(request, error, trace) {
                Flossfox.log(error);
                Flossfox.log(trace);
            },
            success: function(data) {
                updateInputCount();
                if (activeTab == "friends")
                    //populateTweets([nativeJSON.decode(data)], activeTab);
                    refreshTweets();
            }
        });
    }, tweet, urlRe, function(match, callback) { shortenUrl(match[0], callback); });
}

function postRetweet(id) {
    var username = Flossfox.prefs.getCharPref("username");
    if (!username) return;
    var login = getLogin(Flossfox.prefs.getCharPref("username"));
    if (!login) return;

    $.ajax({
        url: apiUrl("statuses/retweet/" + id + ".json"),
        type: "PUT",
        username: login.username,
        password: login.password,
        error: function(request, error, trace) {
            Flossfox.log(error);
            Flossfox.log(trace);
        },
        success: function(data) {
            if (activeTab == "friends")
                refreshTweets();
        }
    });
}
