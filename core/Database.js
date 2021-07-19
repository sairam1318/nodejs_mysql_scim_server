/** Copyright © 2016-2018, Okta, Inc.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// let sqlite3 = require('sqlite3').verbose();
// let db = new sqlite3.Database('scim.db');
const mysql = require('mysql');
var con = mysql.createConnection({
    user     : 'root',
    password : '1234',
    database : 'okta_scim'
});
con.connect();

let uuid = require('uuid');
let scimCore = require('./SCIMCore');
let out = require('./Logs');
let mUser = require('../models/User');
let mGroup = require('../models/Group');
let mGroupMembership = require('../models/GroupMembership');

class Database {
    static dbInit() {
        let query = "SELECT * FROM information_schema.tables WHERE table_schema = 'okta_scim' AND table_name = 'Users' LIMIT 1";

        con.query(query, function (err, rows) {
            if (err !== null) {
                out.error("Database.dbInit::Users::SELECT", err);
            } else if (rows.length == 0) {
                query = "CREATE TABLE Users (id varchar(255) primary key, active int, userName VARCHAR(255), givenName VARCHAR(255), middleName VARCHAR(255), familyName VARCHAR(255), email VARCHAR(255))";
                con.query(query, function (err, result) {
                    if (err !== null) {
                        out.error("Database.dbInit::Users::CREATE", err);
                    }else{
                        console.log("table created");
                    }   
                });
            }
        });

        query = "SELECT * FROM information_schema.tables WHERE table_schema = 'okta_scim' AND table_name = 'Groups_scim' LIMIT 1";
        con.query(query, function (err, rows) {
            if (err !== null) {
                out.error("Database.dbInit::Groups::SELECT", err);
            } else if (rows.length == 0) {
                console.log("inside grp query", rows);
                query = "CREATE TABLE Groups_scim (id varchar(255) primary key, displayName varchar(255))";
                con.query(query, function (err) {
                    if (err !== null) {
                        out.error("Database.dbInit::Groups::CREATE", err);
                    } else{
                        console.log("table created");
                    }
                })
            }
        });

        query = "SELECT * FROM information_schema.tables WHERE table_schema = 'okta_scim' AND table_name = 'GroupMemberships' LIMIT 1";

        con.query(query, function (err, rows) {
            
            if (err !== null) {
                out.error("Database.dbInit::GroupMemberships::SELECT", err);
            } else if (rows.length == 0) {
                query = "CREATE TABLE GroupMemberships (id varchar(255) primary key, groupId VARCHAR(255), userId VARCHAR(255), " +
                        "UNIQUE (groupId, userId))";

                con.query(query, function (err) {
                    if (err !== null) {
                        out.error("Database.dbInit::GroupMemberships::CREATE", err);
                    }else{
                        console.log("table created");
                    }
                });
            }
        });
    }

    static async getFilteredUsers(filterAttribute, filterValue, startIndex, count, reqUrl, callback) {
        let query = "SELECT * FROM Users WHERE " + filterAttribute + "='" + filterValue + "'";
        let self = this;
        console.log("Inside core get filtered user");
        await con.query(query, async function (err, rows) {
            if (err !== null) {
                out.error("Database.getFilteredUsers", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("User Not Found", "404"));
            }

            if (rows.length < count) {
                count = rows.length;
            }

            await self.getGroupMemberships(function (err, memberships) {
                if (err !== null) {
                    callback(scimCore.createSCIMError(err, "400"));
                } else {
                    for (let i = 0; i < rows.length; i++) {
                        rows[i]["groups"] = self.getGroupsForUser(rows[i]["id"], memberships);
                    }

                    callback(scimCore.createSCIMUserList(rows, startIndex, count, reqUrl));
                }
            });
        });
    }

    static async getFilteredGroups(filterAttribute, filterValue, startIndex, count, reqUrl, callback) {
        let query = "SELECT * FROM groups_scim WHERE " + filterAttribute + "='" + filterValue + "'";
        let self = this;

        await con.query(query, async function (err, rows) {
            if (err !== null) {
                out.error("Database.getFilteredGroups", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("Group Not Found", "404"));
            }

            if (rows.length < count) {
                count = rows.length;
            }

            await self.getGroupMemberships(function (err, memberships) {
                if (err !== null) {
                    callback(scimCore.createSCIMError(err, "400"));
                } else {
                    for (let i = 0; i < rows.length; i++) {
                        rows[i]["members"] = self.getUsersForGroup(rows[i]["id"], memberships);
                    }

                    callback(scimCore.createSCIMGroupList(rows, startIndex, count, reqUrl));
                }
            });
        });
    }

    static async getAllUsers(startIndex, count, reqUrl, callback) {
        let query = "SELECT * FROM Users";
        let self = this;

        await con.query(query, async function (err, rows) {
            // console.log(rows);

            if (err !== null) {
                console.log("err is not null");
                out.error("Database.getAllUsers", err);
                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("User Not Found", "404"));
            }

            await self.getGroupMemberships(function (err, memberships) {
                if (err !== null) {
                    callback(scimCore.createSCIMError(err, "400"));
                } else {
                    for (let i = 0; i < rows.length; i++) {
                        rows[i]["groups"] = self.getGroupsForUser(rows[i]["id"], memberships);
                    }

                    callback(scimCore.createSCIMUserList(rows, startIndex, count, reqUrl));
                }
            });
        });
    }

    static async getAllGroups(startIndex, count, reqUrl, callback) {
        let query = "SELECT * FROM groups_scim";
        let self = this;

        await con.query(query, async function (err, rows) {
            console.log("After executing the query. ", err);
            if (err !== null) {
                out.error("Database.getAllGroups", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("User Not Found", "404"));
            }

            if (rows.length < count) {
                count = rows.length;
            }

            await self.getGroupMemberships(function (err, memberships) {
                if (err !== null) {
                    callback(scimCore.createSCIMError(err, "400"));
                } else {
                    for (let i = 0; i < rows.length; i++) {
                        rows[i]["members"] = self.getUsersForGroup(rows[i]["id"], memberships);
                    }
                    callback(scimCore.createSCIMGroupList(rows, startIndex, count, reqUrl));
                }
            });
        });
    }

    static async getUser(userId, reqUrl, callback) {
        let query = "SELECT * FROM Users WHERE id = '" + String(userId) + "'";
        let self = this;

        await con.query(query, async function (err, rows) {
            console.log("inside get user rows: ",rows);
            if (err !== null) {
                out.error("Database.getUser", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("User Not Found", "404"));
            } else {
                await self.getGroupMemberships(function (err, memberships) {
                    if (err !== null) {
                        callback(scimCore.createSCIMError(err, "400"));
                    } else {
                        
                        rows["groups"] = self.getGroupsForUser(rows["id"], memberships);
                        console.log("..... inside.....", rows);
                        callback(scimCore.parseSCIMUser(rows[0], reqUrl));
                    }
                });
            }
        });
    }

    static async getGroup(groupId, reqUrl, callback) {
        let query = "SELECT * FROM groups_scim WHERE id = '" + String(groupId) + "'";
        let self = this;

        await con.query(query, async function (err, rows) {
            if (err !== null) {
                out.error("Database.getGroup", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("Group Not Found", "404"));
            } else {
                await self.getGroupMemberships(function (err, memberships) {
                    if (err !== null) {
                        callback(scimCore.createSCIMError(err, "400"));
                    } else {
                        rows["members"] = self.getUsersForGroup(rows["id"], memberships);
                        callback(scimCore.parseSCIMGroup(rows, reqUrl));
                    }
                });
            }
        });
    }

    static async createUser(userModel, reqUrl, callback) {
        let query = "SELECT * FROM Users WHERE userName='" + userModel["userName"] + "'";

        await con.query(query, function (err, rows) {
            if (err !== null) {
                out.error("Database.createUser::SELECT", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows.length == 0) {
                let userId = String(uuid.v1());

                query = "INSERT INTO Users (id, active, userName, givenName, middleName, familyName, email) \
                         VALUES ('" + String(userId) + "', '" + userModel["active"] + "', '" + userModel["userName"] +
                        "', '" + userModel["givenName"] + "', '" + userModel["middleName"] + "', '" +
                        userModel["familyName"] + "', '" + userModel["email"] + "')";

                con.query(query, async function (err) {
                    if (err !== null) {
                        out.error("Database.createUser::INSERT", err);

                        callback(scimCore.createSCIMError(err, "400"));
                    }

                    let groups = userModel["groups"];

                    if (groups.length === 0) {
                        callback(scimCore.createSCIMUser(userId, true, userModel["userName"], userModel["givenName"],
                            userModel["middleName"], userModel["familyName"], userModel["email"],
                            null, reqUrl));
                    } else {

                        let membershipId = null;

                        query = "INSERT INTO GroupMemberships (id, groupId, userId) VALUES";

                        for (let i = 0; i < groups.length; i++) {
                            if (i > 0) {
                                query = query + ",";
                            }

                            membershipId = String(uuid.v1());

                            query = query + " ('" + membershipId + "', '" + groups[i]["value"] + "', '" + userId + "')";
                        }

                        query = query + ";";
                        await con.query(query, function (err) {
                            if (err !== null) {
                                out.error("Database.createUser::MEMBERSHIPS", err);

                                callback(scimCore.createSCIMError(err, "400"));
                            } else {
                                callback(scimCore.createSCIMUser(userId, true, userModel["userName"], userModel["givenName"],
                                    userModel["middleName"], userModel["familyName"], userModel["email"],
                                    groups, reqUrl));
                            }
                        });
                    }
                });
            } else {
                callback(scimCore.createSCIMError("Conflict - User already exists", "409"));
            }
        });
    }

    static async createGroup(groupModel, reqUrl, callback) {
        let query = "SELECT * FROM groups_scim WHERE displayName='" + groupModel["displayName"] + "'";

        await con.query(query, function (err, rows) {
            console.log(rows);
            if (err !== null) {
                out.error("Database.createGroup::SELECT", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows.length === 0) {
                let groupId = String(uuid.v1());

                query = "INSERT INTO groups_scim (id, displayName) \
                         VALUES ('" + String(groupId) + "', '" + groupModel["displayName"] + "')";

                con.query(query, async function (err) {
                    if (err !== null) {
                        out.error("Database.createGroup::INSERT", err);

                        callback(scimCore.createSCIMError(err, "400"));
                    }

                    let members = groupModel["members"];

                    if (members.length === 0) {
                        callback(scimCore.createSCIMGroup(groupId, groupModel["displayName"], null, reqUrl));
                    } else {
                        let membershipId = null;

                        query = "INSERT INTO GroupMemberships (id, userId, groupId) VALUES";

                        for (let i = 0; i < members.length; i++) {
                            if (i > 0) {
                                query = query + ",";
                            }

                            membershipId = String(uuid.v1());

                            query = query + " ('" + membershipId + "', '" + members[i]["value"] + "', '" + groupId + "')";
                        }

                        query = query + ";";

                        await con.query(query, function (err) {
                            if (err !== null) {
                                out.error("Database.createGroup::MEMBERSHIPS", err);

                                callback(scimCore.createSCIMError(err, "400"));
                            } else {
                                callback(scimCore.createSCIMGroup(groupId, groupModel["displayName"], members, reqUrl));
                            }
                        });
                    }
                });
            } else {
                callback(scimCore.createSCIMError("Conflict - Group already exists", "409"));
            }
        });
    }

    static async patchUser(attributeName, attributeValue, userId, reqUrl, callback) {
        let query = "UPDATE Users SET " + attributeName + " = '" + attributeValue + "' WHERE id = '" + String(userId) + "'";
        let self = this;
        console.log(query);

        await con.query(query, function (err) {
            if (err !== null) {
                out.error("Database.patchUser::UPDATE", err);

                callback(scimCore.createSCIMError(err, "400"));
            }

            query = "SELECT * FROM Users WHERE id = '" + userId + "'";

            con.query(query, async function (err, rows) {
                if (err !== null) {
                    out.error("Database.patchUser::SELECT", err);

                    callback(scimCore.createSCIMError(err, "400"));
                } else if (rows === undefined) {
                    callback(scimCore.createSCIMError("User Not Found", "404"));
                } else {
                    await self.getGroupMemberships(function (err, memberships) {
                        if (err !== null) {
                            callback(scimCore.createSCIMError(err, "400"));
                        } else {
                            rows["groups"] = self.getGroupsForUser(rows["id"], memberships);
                            callback(scimCore.parseSCIMUser(rows[0], reqUrl));
                        }
                    });
                }
            });
        });
    }

    static async patchGroup(attributeName, attributeValue, groupId, reqUrl, callback) {
        let query = "UPDATE groups_scim SET " + attributeName + " = '" + attributeValue + "' WHERE id = '" + String(groupId) + "'";
        let self = this;

        await con.query(query, function (err) {
            if (err !== null) {
                out.error("Database.patchGroup::UPDATE", err);

                callback(scimCore.createSCIMError(err, "400"));
            }

            query = "SELECT * FROM groups_scim WHERE id = '" + groupId + "'";

            con.query(query, async function (err, rows) {
                if (err !== null) {
                    out.error("Database.patchGroup::SELECT", err);

                    callback(scimCore.createSCIMError(err, "400"));
                } else if (rows === undefined) {
                    callback(scimCore.createSCIMError("Group Not Found", "404"));
                } else {
                    await self.getGroupMemberships(function (err, memberships) {
                        if (err !== null) {
                            callback(scimCore.createSCIMError(err, "400"));
                        } else {
                            rows["members"] = self.getUsersForGroup(rows["id"], memberships);
                            callback(scimCore.parseSCIMGroup(rows, reqUrl));
                        }
                    });
                }
            });
        });
    }

    static async updateUser(userModel, userId, reqUrl, callback) {
        let query = "SELECT * FROM Users WHERE id = '" + String(userId) + "'";
        // console.log(userModel);
        await con.query(query, async function (err, rows) {
            if (err !== null) {
                out.error("Database.updateUser::SELECT", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("User Not Found", "404"));
            } else {
                query = "UPDATE Users SET active = '" + userModel['active'] + "', userName = '" + userModel["userName"] + "', givenName = '" + userModel["givenName"] +
                    "', middleName = '" + userModel["middleName"] + "', familyName = '" + userModel["familyName"] +
                    "', email = '" + userModel["email"] + "' WHERE id = '" + String(userId) + "'";
    
                console.log(query);
                await con.query(query, async function (err, row) {
                    console.log(row);
                    if (err !== null) {
                        out.error("Database.updateUser::UPDATE", err);
                        callback(scimCore.createSCIMError(err, "400"));
                    }else{
                    
                        callback(scimCore.parseSCIMUser(row));
                    }

                    let groups = userModel["groups"];
                    // console.log(groups);
                    let membershipId = null;

                    // query = "INSERT INTO GroupMemberships (id, groupId, userId) VALUES";
                    // //have to make changes here I made it to 
                    // for (let i = 0; i < groups.length; i++) {
                    //     if (i > 0) {
                    //         query = query + ",";
                    //     }

                    //     membershipId = String(uuid.v1());

                    //     query = query + " ('" + membershipId + "', '" + groups[i]["value"] + "', '" + userId + "')";
                        
                    // }
                    // query = query + ";";
                    
                    // await con.query(query, function (err) {
                    //     if (err !== null) {
                    //         out.error("Database.updateUser::MEMBERSHIPS", err);

                    //         callback(scimCore.createSCIMError(err, "400"));
                    //     } else {
                    //         callback(scimCore.createSCIMUser(userId, rows.active, userModel["userName"], userModel["givenName"],
                    //             userModel["middleName"], userModel["familyName"], userModel["email"],
                    //             groups, reqUrl));
                    //     }
                    // });
                    
                });
            }
        });
    }

    static async updateGroup(groupModel, groupId, reqUrl, callback) {
        let query = "SELECT * FROM groups_scim WHERE id = '" + String(groupId) + "'";

        await con.query(query, function (err, rows) {
            if (err !== null) {
                out.error("Database.updateGroup::SELECT", err);

                callback(scimCore.createSCIMError(err, "400"));
            } else if (rows === undefined) {
                callback(scimCore.createSCIMError("Group Not Found", "404"));
            } else {
                query = "UPDATE groups_scim SET displayName = '" + groupModel["displayName"] + "' WHERE id = '" + String(groupId) + "'";
                console.log("update query", query);
                con.query(query, async function (err) {
                    if (err !== null) {
                        out.error("Database.updateGroup::UPDATE", err);

                        callback(scimCore.createSCIMError(err, "400"));
                    }

                    let members = groupModel["members"];
                    let membershipId = null;
                    //changed from insert to update.
                    query = "Insert INTO GroupMemberships (id, userId, groupId) VALUES";

                    for (let i = 0; i < members.length; i++) {
                        if (i > 0) {
                            query = query + ",";
                        }

                        membershipId = String(uuid.v1());

                        query = query + " ('" + membershipId + "', '" + members[i]["value"] + "', '" + groupId + "')";
                    }

                    query = query + ";";
                    console.log(query);
                    callback(scimCore.createSCIMGroup(groupId, groupModel["displayName"], members, reqUrl));

                    // await con.query(query, function (err) {
                    //     if (err !== null) {
                    //         out.error("Database.updateGroup::MEMBERSHIPS", err);
                    //         callback(scimCore.createSCIMError(err, "400"));
                    //     } else {
                    //         callback(scimCore.createSCIMGroup(groupId, groupModel["displayName"], members, reqUrl));
                    //     }
                    // });
                });
            }
        });
    }

    static async getGroupMemberships(callback) {
        let query = "SELECT m.groupId, m.userId, g.displayName, u.givenName, u.familyName " +
                    "FROM groupMemberships m " +
                    "LEFT JOIN groups_scim g ON m.groupId = g.id " +
                    "LEFT JOIN Users u ON m.userId = u.id";

        await con.query(query, function (err, rows) {
            if (err !== null) {
                out.error("Database.getGroupMemberships", err);

                callback(err, null);
            } else if (rows === undefined) {
                callback(null, null);
            } else {
                let memberships = [];

                for (let i = 0; i < rows.length; i++) {
                    let userDisplay = rows[i]["givenName"] + " " + rows[i]["familyName"];
                    memberships.push(mGroupMembership.createMembership(rows[i]["groupId"], rows[i]["userId"],
                        rows[i]["displayName"], userDisplay));
                }

                callback(null, memberships);
            }
        });
    }

    static getGroupsForUser(userId, memberships) {
        let userGroups = [];

        for (let i = 0; i < memberships.length; i++) {
            if (memberships[i]["userId"] === String(userId)) {
                userGroups.push(mUser.createGroup(memberships[i]["groupId"], memberships[i]["groupDisplay"]));
            }
        }

        return userGroups;
    }

    static getUsersForGroup(groupId, memberships) {
        let groupUsers = [];

        for (let i = 0; i < memberships.length; i++) {
            if (memberships[i]["groupId"] === String(groupId))
            {
                groupUsers.push(mGroup.createUser(memberships[i]["userId"], memberships[i]["userDisplay"]));
            }
        }

        return groupUsers;
    }
    static authenticateUser(username, password) {
        let query = 'select count(*) from login where username = \"' + username + '\"  and password = \"' + password + '\"';
        con.query(query, (err, count) => {
            if (err) {
              console.log(err);
              return 0;
            }
            if(count[0]['count(*)'] == 1){
                console.log("Validated");
                return 1;
            }else{
                console.log("error while logging");
                console.log(query);
                return 0;
            } 
        });
    } 
    // static getUsersFromDatabase(){
    //     let usersData = [];
    //     con.query("SELECT * FROM Users", function (err, result, fields) {
    //         if (err) throw err;
    //         for(let i=0; i <= result.length; i++){
    //             usersData.push(scimCore.parseSCIMUser(result[i]))
    //         }
    //     });
    //     return usersData;
    // }
}

module.exports = Database;