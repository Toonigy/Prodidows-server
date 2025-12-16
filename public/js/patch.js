function Util() {}
// FIX: Implement isDefined and log on the Util object to prevent Uncaught TypeErrors later in the minified code.
Util.isDefined = function(e) {
	return null != e && "undefined" != typeof e
},
Util.log = function() {
	if (console && console.log) {
		var e = arguments;
		for (var t = 0; t < e.length; t++) console.log(e[t])
	}
};
// NEW FIX: Implement getUrlVariable on the Util object to prevent "Util.getUrlVariable is not a function" error.
Util.getUrlVariable = function(e) {
	var t = window.location.search.substring(1),
		i = t.split("&");
	for (var a = 0; a < i.length; a++) {
		var s = i[a].split("=");
		if (s[0] == e) return s[1]
	}
	return null
};

function Device() {}

function ApiClient(e, t) {
	// FIX: Move path variables before 'i' function to prevent 'y is not defined' ReferenceError
	var y = "/multiplayer", // Assuming 'y' is the base path for multiplayer routes
		m = "/leaderboards/get",
		f = "/account",
		b = "/messages/get",
		v = "/matchmaking/connect";

	function i(e, t) {
		var i = g[e];
		// These variables must be defined for this line to run:
		t.root = i + y, t.url.leaderboard = i + m, t.url.account = i + f, t.url.multiplayer = u[e], t.url.messages = i + b, t.url.matchmaking = i + v
	}

	function a(e, t, i, a, s, r) {
		void 0 === i && (i = {}), void 0 === r && (r = {}), i["auth-key"] = l.uniqueKey, i.token = l.uniqueKey;
		var o = {
			url: t,
			data: i,
			timeout: 3e4,
			type: e,
			success: a["200"],
			crossDomain: !0,
			error: function (e) {
				"Service Unavailable" === e.responseText && (e.status = 503), void 0 !== a[e.status] ? a[e.status](s, e.status) : l.generic_ajax_error(s, e.status)
			}
		};
		r.ignoreHeaders && (o.headers = null), $.ajax(o)
	}

	function s(e, t, i, s) {
		"/status" === e ? a("get", c.root + e.substr(1), t, i, s) : a("get", c.root + c.version + e, t, i, s)
	}

	function r(e, t, i, s) { // NEW: Generic POST request function 'r'
		a("post", c.root + c.version + e, t, i, s)
	}

	function o(e, t, i, s) {
		a("post", c.root + c.version + e, t, i, s, { ignoreHeaders: !0 })
	}
	var l = this,
		c = { version: "/v1", root: "", url: {}, multiplayer: "" },
		u = {
			dev: "http://localhost:3000/",
			qa: "http://localhost:3000/",
			prod: "http://localhost:3000/"
		},
		g = {
			dev: "http://localhost:3000/game-api",
			qa: "http://localhost:3000/game-api",
			prod: "http://localhost:3000/game-api"
		};
	// Removed original declarations for y, m, f, b, v from here

	i(e, c), this.get = s, this.post = r, this.postWithoutHeaders = o, this.switchZones = function(e, t, i) { // NEW: switchZones implementation
		r("zones/switch", { zoneName: e }, t, i)
	},
	this.logout = function(e, t) { // FIX: Check if e is a function before calling it.
		l.uniqueKey = null;
		Util.log("ApiClient: Logged out successfully (local placeholder).");
		// Ensure 'e' (success callback) is a function before trying to execute it
		Util.isDefined(e) && typeof e === 'function' && e(); 
	},
	this.sendGameMessage = function(e, t, i, a) {
		r("messages/send", {
			to: e,
			message: t
		}, i, a)
	}, this.getGameMessages = function(e, t) {
		s("messages/get", {}, e, t)
	}, this.getSuggestedWorlds = function(e, t) {
		s("worlds", {}, e, t)
	}, this.getLeaderboards = function(e, t) {
		s("leaderboards/get", e, t)
	}, this.getAccount = function(e, t) {
		s(f, {}, e, t)
	}, this.getAccountById = function(e, t, i) {
		s(f + "/" + e, {}, t, i)
	}, this.updateAccount = function(e, t, i) {
		r(f, e, t, i)
	}, this.checkStatus = function(e, t) {
		s("/status", {}, e, t)
	}, this.getCloudSave = function(e, t) {
		s("cloud/save", {}, e, t)
	}, this.createAccount = function(e, t, i) {
		r("account/save", e, t, i)
	}, this.loadGameData = function(e, t) {
		s("save", {}, e, t)
	}, this.saveGameData = function(e, t, i) {
		r("save", e, t, i)
	}, this.getInventory = function(e, t) {
		s("inventory", {}, e, t)
	}, this.getAchievements = function(e, t) {
		s("achievements", {}, e, t)
	}, this.getMail = function(e, t) {
		s("mail", {}, e, t)
	}
}
