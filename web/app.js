var crypto = require("crypto");
var fs = require("fs");
var http = require("http");
var https = require("https");
var util = require("util");
var express = require("express");
var pg = require("pg.js");

var strformat = util.format;
var pgdb = "postgres://meeci:IoMQwf5E7u8@0.0.0.0/meeci";
var meecidir = "/var/lib/meeci";
var tasks = {queue: []};
tasks.queue.push({
    url: 'git@github.com:wizawu/meeci.git',
    start: 1396334969,
    owner: 'wizawu',
    repository: 'meeci',
    worker: '192.168.3.39',
    build: 99
});

var app = express();

app.use(express.static("./public"));
app.use(express.logger({
    format: ':remote-addr - - [:date] ":method :url HTTP/:http-version" '+
            ':status :res[content-length] - :response-time ms'
}));
app.use(express.errorHandler());
app.use(express.bodyParser());
app.use(express.cookieParser(crypto.randomBytes(64).toString('base64')));
app.use(express.session());

app.get("/", function(req, res) {
    res.sendfile("home.html");
});

app.get("/logout", function(req, res) {
    req.session.user = null;
    res.send(200);
});

app.post("/signup", function(req, res) {
    var body = req.body;
    var user = body.user, email = body.email, passwd = body.passwd;
    if (user && email && passwd) {
        if (user[0] >= '0' && user[0] <= '9') {
            res.send(401);
        } else if (! check_letter(user)) {
            res.send(401);
        } else if (! check_letter(email, "@-.")) {
            res.send(402);
        } else if (! check_letter(passwd)) {
            res.send(403);
        } else {
            var cond = strformat("user_ = '%s'", user);
            sql_exist("users", cond, function() {
                res.send(401);
            });
            var cond = strformat("email = '%s'", email);
            sql_exist("users", cond, function() {
                res.send(402);
            });
            passwd = encrypt(passwd);
            var values = strformat(
                "'%s', '%s', '%s', '%s', 1",
                user, email, passwd.hash, passwd.salt
            );
            // TODO: do not use the two sql_exist above
            sql_insert(
                "users", "user_, email, passwd, salt, status",
                values, function(code) {
                    if (code == 200) {
                        fs.mkdir(meecidir + '/containers/wizawu', function(err) {
                            console.log(err);
                        });
                    }
                    res.send(code);
                }
            );
        }
    } else {
        res.send(400);
    }
});

app.post("/user", function(req, res) {
    var body = req.body;
    var user = body.user, passwd = body.passwd;
    if (user && passwd) {
        sql_auth(user, passwd, function(code) {
            if (code == 200) {
                req.session.user = user;
                var name = body.name, new_passwd = body.new_passwd, q;
                if (name) {
                    q = strformat(
                        "UPDATE users SET name='%s' WHERE user_='%s'",
                        name, user
                    );
                    sql_execute(q);
                }
                if (new_passwd) {
                    passwd = encrypt(new_passwd);
                    q = strformat(
                        "UPDATE users SET passwd='%s', salt='%s' WHERE user_='%s'",
                        passwd.hash, passwd.salt, user
                    );
                    sql_execute(q);
                }
            }
            res.send(code);
        });
    } else {
        res.send(400);
    }
});

app.get("/user", function(req, res) {
    if (req.session.user == null) {
        res.json({"user": null});
    } else {
        var user = req.session.user;
        pg.connect(pgdb, function(err, client, release) {
            if (err) return errlog(err);
            var q = strformat("SELECT * FROM users WHERE user_ = '%s'", user); 
            client.query(q, function(err, _res) {
                release();
                if (err) {
                    res.send(500);
                    return errlog(err);
                } else {
                    var row = _res.rows[0];
                    res.json(200, {
                        user: user,
                        name: row.name,
                        email: row.email,
                        gravatar: gravatar_url(row.email),
                        passwd: null
                    });
                }
            });
        });
    }
});

app.post("/watch", function(req, res) {
    var user = req.session.user;
    var giturl = req.body.giturl, watch = req.body.watch;
    if (user && giturl) {
        var host = resolve_git(giturl);
        if (host == -1) return res.send(406);
        var owner = repos_owner(giturl)[0];
        var repos = repos_owner(giturl)[1];
        if (watch == false) {
            var q = strformat(
                "DELETE FROM repos WHERE user_='%s' AND repos='%s' AND owner='%s' AND host=%d",
                user, repos, owner, host
            );
            return sql_execute(q, function(_) {
                res.send(200);
            });
        }
        if (host == 1) {
            var path = strformat("/repos/%s/%s", owner, repos);
        } else {
            var path = strformat("/2.0/repositories/%s/%s", owner, repos);
        }
        https_get(host, path, function(j) {
            if (typeof(j) == "number") {
                res.send(j);
            } else {
                var desc = j.description;
                sql_insert(
                    "repos", "user_, host, owner, repos, descr",
                    strformat("'%s',%d,'%s','%s','%s'", user, host, owner, repos, desc),
                    function(code) { res.send(code); }
                );
            }
        });
    } else {
        res.send(400);
    }
});

app.get("/repos", function(req, res) {
    var user = req.session.user;
    if (user) {
        var q = strformat("SELECT * FROM repos WHERE user_ = '%s'", user);
        sql_execute(q, function(rows) {
            res.json(200, {watched: rows});
        });
    } else {
        res.send(400);
    }
});

app.get("/repos/options/:host/:owner/:repos", function(req, res) {
    var user = req.session.user;
    if (user) {
        var host = (req.params.host == "github") ? 1 : 2;
        var owner = req.params.owner;
        var repos = req.params.repos;
        var q = strformat(
            "SELECT * FROM repos WHERE user_='%s' AND repos='%s' AND owner='%s' AND host=%d",
            user, repos, owner, host
        );
        sql_execute(q, function(rows) {
            res.json(200, {
                container: rows[0].container,
                script: rows[0].script
            });
        });
    } else {
        res.send(400);
    }
});

app.post("/repos/options/:host/:owner/:repos", function(req, res) {
    var user = req.session.user, body = req.body;
    var cont = body.container, script = body.script;
    if (user && cont && script) {
        var host = (req.params.host == "github") ? 1 : 2;
        var owner = req.params.owner;
        var repos = req.params.repos;
        var q = strformat(
            "UPDATE repos SET container='%s', script='%s' WHERE user_='%s' AND repos='%s' AND owner='%s' AND host=%d",
            cont, script, user, repos, owner, host
        );
        sql_execute(q, function(_) { res.send(200); });
    } else {
        res.send(400);
    }
});

app.get("/queue", function(req, res) {
    res.json(200, tasks);
});

app.get("/task", function(req, res) {
    if (tasks.queue.length == 0) {
        res.send(204);
    } else {
        tasks.queue[0].worker = req.ip;
        tasks.queue[0].start = Math.floor((new Date).getTime()/1000);
        res.json(200, tasks.queue[0]);
    }
});

app.get("/containers", function(req, res) {
    var user = req.session.user;
    if (user) {
        var q = strformat("SELECT * FROM container WHERE user_ = '%s'", user);
        sql_execute(q, function(rows) {
            res.json(200, { list: rows });
        });
    } else {
        res.send(400);
    }
});

app.get("/container/:name", function(req, res) {
    var user = req.session.user, name = req.params.name;
    if (user && name) {
        var path = strformat(meecidir + "/containers/%s/%s.sh", user, name);
        fs.readFile(path, function(err, data) {
            if (err) {
                errlog(err);
                res.send(404);
            } else {
                res.set('Content-Type', 'text/plain');
                res.send(200, data);
            }
        });
    } else {
        res.send(400);
    }
});

app.get("/logs/container/:id", function(req, res) {
    var path = strformat(meecidir + "/logs/container/%d.log", req.params.id);
    fs.readFile(path, function(err, data) {
        if (err) {
            errlog(err);
            res.send(404);
        } else {
            res.set('Content-Type', 'text/plain');
            res.send(200, data);
        }
    });
});

app.post("/hooks/:user", function(req, res) {
});

var port = process.env.MEECI_PORT || 3780;
http.createServer(app).listen(port, function() {
    console.log("Meeci Web is listening on port " + port);
});

/* Internal Functions */
function errlog(err) {
    return console.error(err);
}

function check_letter(str, extra) {
    for (var i in str) {
        var c = str[i];
        if (c >= 'a' && c <= 'z') continue;
        else if (c >= 'A' && c <= 'Z') continue;
        else if (c >= '0' && c <= '9') continue;
        else if (c == '_') continue;
        else if (extra && extra.search(c) >= 0) continue;
        else return false;
    }
    return true;
}

function encrypt(passwd) {
    var salt = crypto.randomBytes(32).toString("base64");
    var hash = crypto.createHash("sha256").update(salt+passwd).digest("base64");
    return { hash: hash, salt: salt };
}

function password_match(passwd, hash, salt) {
    return hash == crypto.createHash("sha256").update(salt+passwd).digest("base64");
}

function gravatar_url(email) {
    var hex = crypto.createHash("md5").update(email).digest("hex");
    return strformat("http://www.gravatar.com/avatar/%s.png?s=48", hex);
}

function resolve_git(url) {
    var github = /git@github.com:\w+\/\S+\.git/gi;
    var bitbucket = /git@bitbucket.org:\w+\/\S+\.git/gi;
    if (github.test(url)) return 1;
    else if (bitbucket.test(url)) return 2;
    else return -1;
}

function repos_owner(url) {
    var n = url.length;
    if (url.search("git@github.com") == 0) {
        return url.substring(15, n - 4).split('/', 2);
    } else {
        return url.substring(18, n - 4).split('/', 2);
    }
}

function https_get(host, path, callback) {
    var host = (host == 1) ? "api.github.com" : "api.bitbucket.org";
    https.get({
        host: host,
        path: path,
        headers: {'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64; rv:27.0) Gecko/20100101 Firefox/27.0'
        }
    }, function(res) {
        if (res.statusCode == 200) {
            var body = [];
            res.on('data', function(chunk) {
                body.push(chunk);
            });
            res.on('end', function(chunk) {
                body = body.join('');
                callback(JSON.parse(body));
            });
        } else {
            errlog("GET https://" + host + path + " " + res.statusCode);
            callback(res.statusCode);
        }
    });
}

/* SQL Query */
function sql_exist(table, cond, callback) {
    var q = strformat("SELECT 1 FROM %s WHERE %s;", table, cond);
    pg.connect(pgdb, function(err, client, release) {
        if (err) return errlog(err);
        client.query(q, function(err, res) {
            release();
            if (err) {
                return errlog(err);
            } else if (res.rows.length > 0) {
                callback();
            }
        });
    });
}

function sql_insert(table, fields, values, callback) {
    var q = strformat("INSERT INTO %s(%s) VALUES(%s)", table, fields, values);
    pg.connect(pgdb, function(err, client, release) {
        if (err) return errlog(err);
        client.query(q, function(err, res) {
            release();
            if (err) {
                callback(500);
                return errlog(err);
            } else {
                callback(200);
            }
        });
    });
}

function sql_auth(user, passwd, callback) {
    var q = strformat("SELECT * FROM users WHERE user_ = '%s'", user);
    pg.connect(pgdb, function(err, client, release) {
        if (err) return errlog(err);
        client.query(q, function(err, res) {
            release();
            if (err) {
                callback(500);
                return errlog(err);
            } else {
                if (res.rows.length == 0) {
                    callback(401);
                } else {
                    var hash = res.rows[0].passwd;
                    var salt = res.rows[0].salt;
                    callback(password_match(passwd, hash, salt) ? 200:401);
                }
            }
        });
    });
}

function sql_execute(query, callback) {
    pg.connect(pgdb, function(err, client, release) {
        if (err) return errlog(err);
        client.query(query, function(err, res) {
            release();
            if (err) return errlog(err);
            if (callback) callback(res.rows);
        });
    });
}
