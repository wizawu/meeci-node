/* Backbone models */
SignUp = Backbone.Model.extend({
    url: "/signup"
});

User = Backbone.Model.extend({
    defaults: {
        "user" : null,
        "name" : null,
        "email": null
    },
    url: "/user"
});

var user = new User;

/* Return the first child with the specified tag name */
function getChildByTagName(node, tag) {
    var children = node.childNodes;
    var n = children.length;
    for (var i = 0; i < n; i++) {
        if (children[i].nodeName.toLowerCase() == tag) {
            return children[i];
        }
    }
}

function displayElementById(id, attr) {
    if (!attr) attr = "block";
    document.getElementById(id).style.display = attr;
}

/* Change the tab content */
function activeTab(id) {
    var list = document.getElementById("tab-titles").childNodes;
    var n = list.length;
    for (var i = 0; i < n; i++) {
        if (list[i].nodeName.toLowerCase() == "li") {
            if (list[i].getAttribute("tabid") == id) {
                list[i].className = "active";
            } else {
                list[i].className = "";
            }
        }
    }

    var tabs = document.getElementById("tab-content").childNodes;
    var n = tabs.length;
    for (var i = 0; i < n; i++) {
        var t = tabs[i];
        if (t.nodeName.toLowerCase() == "div") {
            t.style.display = (t.id == id)? "block":"none";
        }
    }
}

function addClickTabEvent() {
    var list = document.getElementById("tab-titles").childNodes;
    var n = list.length;
    for (var i = 0; i < n; i++) {
        var li = list[i];
        if (li.nodeName.toLowerCase() == "li") {
            getChildByTagName(li, "a").onclick = function() {
                activeTab(this.parentNode.getAttribute("tabid"));
                return false;
            };
        }
    }
}

/* Hide all elements not in common */
function hideAll() {
    var ids = [
        "form-login", "profile",
        "li-repos", "li-container", "li-account", "li-signup"
    ];
    for (var i = 0; i < ids.length; i++) {
        displayElementById(ids[i], "none");
    }
}

/* Decide which to display on top-right corner */
function setDivAccount() {
    user.fetch({
        success: function(model, response, options) {
            if (model.get("user")) {
                displayElementById("form-login", "none");
                displayElementById("profile", "block");
            } else {
                displayElementById("form-login", "block");
                displayElementById("profile", "none");
            }
        }
    });
}

/* Switch to Join-Now tab */
function addJoinEvent() {
    var b = document.getElementById("join-now");
    b.onclick = function() {
        displayElementById("li-signup");
        activeTab("tab-signup");
    };
}

function addSignUpEvent() {
    var f = getChildByTagName(document.getElementById("tab-signup"), "form");
    var b = getChildByTagName(f, "button");
    var inputs = ["sign-user", "sign-email", "sign-pswd1", "sign-pswd2"];
    for (var i in inputs) {
        inputs[i] = document.getElementById(inputs[i]);
    }
    b.onclick = function() {
        if (inputs[2].value != inputs[3].value) {
            alert("The two passwords are not consistent.");
            inputs[2].value = inputs[3].value = "";
            return false;
        }
        var signup = new SignUp({
            user   : inputs[0].value.trim(),
            email  : inputs[1].value.trim(),
            passwd : inputs[2].value.trim()
        });
        signup.save(signup.attributes, {
            error: function(model, response, options) {
                switch (response.status) {
                    case 200:
                        alert("You have signed up successfully!");
                        for (var i in inputs) inputs[i].value = "";
                        break;
                    case 400:
                        alert("Incomplete sign-up form.");
                        break;
                    case 401:
                        alert("Please use another username.");
                        inputs[0].value = "";
                        break;
                    case 402:
                        alert("Please use another email.");
                        inputs[1].value = "";
                        break;
                    case 403:
                        alert("Invalid password.");
                        inputs[2].value = inputs[3].value = "";
                        break;
                    default:
                        alert(response.status + " " + response.statusText);
                }
            }
        });
    }
}

/* Gather all add-event functions */
function addEvents() {
    addClickTabEvent();
    addJoinEvent();
    addSignUpEvent();
}

window.onload = function() {
    hideAll();
    setDivAccount();
    addEvents();
}
