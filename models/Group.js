class Group  {
    static parseFromSCIMResource(groupJsonData) {
        let group = {
            "id": null,
            "displayName": null,
            // "active": true,
            "members": []
        };

        group["id"] = groupJsonData["id"];
        group["displayName"] = groupJsonData["displayName"];

        let members = [];

        for (let i = 0; i < groupJsonData["members"].length; i++) {
            members.push(this.parseMemberships(groupJsonData["members"][i]));
        }

        group["members"] = members;

        return group;
    }

    static parseMemberships(groupMembersJsonData) {
        let member = {
            "value": null,
            "ref": null,
            "display": null
        };

        member["value"] = groupMembersJsonData["value"];
        member["ref"] = groupMembersJsonData["$ref"];
        member["display"] = groupMembersJsonData["display"];

        return member;
    }

    static createUser(userId, displayName) {
        let user = {
            "value": null,
            "$ref": null,
            "display": null
        };

        user["value"] = userId;
        user["$ref"] = "../Users/" + userId;
        user["display"] = displayName;
        return user;
    }
}

module.exports = Group;