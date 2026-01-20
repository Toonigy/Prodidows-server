/**
 * Debugger Module
 * Provides real-time introspection into the server state, 
 * socket connections, and player synchronization events.
 */

module.exports = (activePlayers, uidToSocket) => {
    const debugState = {
        totalConnections: 0,
        eventCounter: {},
        lastErrors: [],
        socialActivity: {
            friendRequestsSent: 0,
            listFetches: 0
        }
    };

    const logState = () => {
        console.log("\n--- SERVER DEBUG SNAPSHOT ---");
        console.log(`Active Socket Sessions: ${activePlayers.size}`);
        console.log(`Registered UIDs: ${uidToSocket.size}`);
        
        const registered = [];
        const pending = [];
        
        activePlayers.forEach((p, sid) => {
            if (p.userID) {
                registered.push({ sid, uid: p.userID, name: p.name });
            } else {
                pending.push(sid);
            }
        });

        console.log(`Registered Players:`, registered);
        console.log(`Pending Registration: ${pending.length}`);
        console.log(`Social Stats: Requests: ${debugState.socialActivity.friendRequestsSent}, Fetches: ${debugState.socialActivity.listFetches}`);
        console.log("-----------------------------\n");
    };

    const trackEvent = (eventName, data) => {
        debugState.eventCounter[eventName] = (debugState.eventCounter[eventName] || 0) + 1;
        
        // Handle social specific tracking
        if (eventName === 'friend_request') debugState.socialActivity.friendRequestsSent++;
        if (eventName === 'friend_list_fetch') debugState.socialActivity.listFetches++;

        // Optionally log high-volume events like 'move' only occasionally
        if (eventName !== 'move' || debugState.eventCounter[eventName] % 50 === 0) {
            console.log(`[DEBUG] Event: ${eventName} | Count: ${debugState.eventCounter[eventName]}`);
        }
    };

    const trackError = (context, error) => {
        const errObj = { timestamp: new Date(), context, message: error.message };
        debugState.lastErrors.unshift(errObj);
        if (debugState.lastErrors.length > 10) debugState.lastErrors.pop();
        console.error(`[CRITICAL DEBUG] ${context}:`, error);
    };

    return {
        logState,
        trackEvent,
        trackError,
        getStats: () => ({ ...debugState, activeCount: activePlayers.size })
    };
};
