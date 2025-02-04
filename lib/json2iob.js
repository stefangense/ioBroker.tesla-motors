//v1.0 custom

const JSONbig = require("json-bigint")({ storeAsString: true });
module.exports = class Json2iob {
    constructor(adapter) {
        this.adapter = adapter;
        this.alreadyCreatedOBjects = {};
    }

    async parse(path, element, options) {
        try {
            if (element === null || element === undefined) {
                this.adapter.log.debug("Cannot extract empty: " + path);
                return;
            }

            const objectKeys = Object.keys(element);

            if (!options || !options.write) {
                if (!options) {
                    options = { write: false };
                } else {
                    options["write"] = false;
                }
            }
            if (typeof element === "string" || typeof element === "number") {
                let name = element;
                if (typeof element === "number") {
                    name = element.toString();
                }

                //custom ignore tokens
                if (path.indexOf(".tokens.") !== -1) {
                    return;
                }

                if (!this.alreadyCreatedOBjects[path]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path, {
                            type: "state",
                            common: {
                                name: name,
                                role: this.getRole(element, options.write),
                                type: element !== null ? typeof element : "mixed",
                                write: options.write,
                                read: true,
                            },
                            native: {},
                        })
                        .then(() => {
                            this.alreadyCreatedOBjects[path] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }

                this.adapter.setState(path, element, true);

                return;
            }
            if (!this.alreadyCreatedOBjects[path]) {
                await this.adapter
                    .setObjectNotExistsAsync(path, {
                        type: "channel",
                        common: {
                            name: options.channelName || "",
                            write: false,
                            read: true,
                        },
                        native: {},
                    })
                    .then(() => {
                        this.alreadyCreatedOBjects[path] = true;
                    })
                    .catch((error) => {
                        this.adapter.log.error(error);
                    });
            }
            if (Array.isArray(element)) {
                this.extractArray(element, "", path, options);
                return;
            }
            objectKeys.forEach(async (key) => {
                if (this.isJsonString(element[key])) {
                    element[key] = JSONbig.parse(element[key]);
                }

                if (Array.isArray(element[key])) {
                    this.extractArray(element, key, path, options);
                } else if (element[key] !== null && typeof element[key] === "object") {
                    this.parse(path + "." + key, element[key], options);
                } else {
                    //custom decimal trim
                    const trimToTwoDecArray = ["percentage_charged", "battery_power", "energy_left", "load_power", "grid_power", "solar_power", "battery", "solar"];
                    if (trimToTwoDecArray.includes(key) || key.indexOf("_imported") !== -1 || key.indexOf("_exported") !== -1) {
                        element[key] = parseFloat(parseFloat(element[key]).toFixed(2));
                    }
                    if (!this.alreadyCreatedOBjects[path + "." + key]) {
                        await this.adapter
                            .setObjectNotExistsAsync(path + "." + key, {
                                type: "state",
                                common: {
                                    name: key,
                                    role: this.getRole(element[key], options.write),
                                    type: element[key] !== null ? typeof element[key] : "mixed",
                                    write: options.write,
                                    read: true,
                                },
                                native: {},
                            })
                            .then(() => {
                                this.alreadyCreatedOBjects[path + "." + key] = true;
                            })
                            .catch((error) => {
                                this.adapter.log.error(error);
                            });
                    }

                    this.adapter.setState(path + "." + key, element[key], true);
                    //custom mileage conversion
                    if ((key.endsWith("_range") && !isNaN(element[key]) && element[key] !== true) || key === "odometer" || key === "range" || key === "speed") {
                        if (!this.alreadyCreatedOBjects[path + "." + key + "_km"]) {
                            await this.adapter
                                .setObjectNotExistsAsync(path + "." + key + "_km", {
                                    type: "state",
                                    common: {
                                        name: key,
                                        role: this.getRole(element[key], options.write),
                                        type: "number",
                                        write: options.write,
                                        read: true,
                                    },
                                    native: {},
                                })
                                .then(() => {
                                    this.alreadyCreatedOBjects[path + "." + key + "_km"] = true;
                                })
                                .catch((error) => {
                                    this.adapter.log.error(error);
                                });
                        }
                        this.adapter.setState(path + "." + key + "_km", parseFloat((element[key] * 1.609344).toFixed(2)), true);
                    }
                }
            });
        } catch (error) {
            this.adapter.log.error("Error extract keys: " + path + " " + JSON.stringify(element));
            this.adapter.log.error(error);
        }
    }
    extractArray(element, key, path, options) {
        try {
            if (key) {
                element = element[key];
            }
            element.forEach(async (arrayElement, index) => {
                index = index + 1;
                if (index < 10) {
                    index = "0" + index;
                }
                let arrayPath = key + index;
                if (typeof arrayElement === "string") {
                    this.parse(path + "." + key + "." + index, arrayElement, options);
                    return;
                }
                if (typeof arrayElement[Object.keys(arrayElement)[0]] === "string") {
                    arrayPath = arrayElement[Object.keys(arrayElement)[0]];
                }
                Object.keys(arrayElement).forEach((keyName) => {
                    if (keyName.endsWith("Id") && arrayElement[keyName] !== null) {
                        if (arrayElement[keyName] && arrayElement[keyName].replace) {
                            arrayPath = arrayElement[keyName].replace(/\./g, "");
                        } else {
                            arrayPath = arrayElement[keyName];
                        }
                    }
                });
                Object.keys(arrayElement).forEach((keyName) => {
                    if (keyName.endsWith("Name")) {
                        arrayPath = arrayElement[keyName];
                    }
                });

                if (arrayElement.id) {
                    if (arrayElement.id.replace) {
                        arrayPath = arrayElement.id.replace(/\./g, "");
                    } else {
                        arrayPath = arrayElement.id;
                    }
                }
                if (arrayElement.name) {
                    arrayPath = arrayElement.name.replace(/\./g, "");
                }
                if (arrayElement.start_date_time) {
                    arrayPath = arrayElement.start_date_time.replace(/\./g, "");
                }
                if (options.preferedArrayName && arrayElement[options.preferedArrayName]) {
                    if (arrayElement[options.preferedArrayName].replace) {
                        arrayPath = arrayElement[options.preferedArrayName].replace(/\./g, "");
                    } else {
                        arrayPath = arrayElement[options.preferedArrayName];
                    }
                }

                if (options.forceIndex) {
                    arrayPath = key + index;
                }
                //special case array with 2 string objects
                if (
                    !options.forceIndex &&
                    Object.keys(arrayElement).length === 2 &&
                    typeof Object.keys(arrayElement)[0] === "string" &&
                    typeof Object.keys(arrayElement)[1] === "string" &&
                    typeof arrayElement[Object.keys(arrayElement)[0]] !== "object" &&
                    typeof arrayElement[Object.keys(arrayElement)[1]] !== "object" &&
                    arrayElement[Object.keys(arrayElement)[0]] !== "null"
                ) {
                    let subKey = arrayElement[Object.keys(arrayElement)[0]];
                    const subValue = arrayElement[Object.keys(arrayElement)[1]];
                    const subName = Object.keys(arrayElement)[0] + " " + Object.keys(arrayElement)[1];
                    if (key) {
                        subKey = key + "." + subKey;
                    }
                    if (!this.alreadyCreatedOBjects[path + "." + subKey]) {
                        await this.adapter
                            .setObjectNotExistsAsync(path + "." + subKey, {
                                type: "state",
                                common: {
                                    name: subName,
                                    role: this.getRole(subValue, options.write),
                                    type: subValue !== null ? typeof subValue : "mixed",
                                    write: options.write,
                                    read: true,
                                },
                                native: {},
                            })
                            .then(() => {
                                this.alreadyCreatedOBjects[path + "." + subKey] = true;
                            });
                    }
                    this.adapter.setState(path + "." + subKey, subValue, true);
                    return;
                }
                this.parse(path + "." + arrayPath, arrayElement, options);
            });
        } catch (error) {
            this.adapter.log.error("Cannot extract array " + path);
            this.adapter.log.error(error);
        }
    }
    isJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }
    getRole(element, write) {
        if (typeof element === "boolean" && !write) {
            return "indicator";
        }
        if (typeof element === "boolean" && write) {
            return "switch";
        }
        if (typeof element === "number" && !write) {
            return "value";
        }
        if (typeof element === "number" && write) {
            return "level";
        }
        if (typeof element === "string") {
            return "text";
        }
        return "state";
    }
};
