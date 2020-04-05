#!/usr/bin / env node

"use strict";

// libs init

const program = require("commander");
const colors = require("colors");
const Q = require("bluebird");
const fs = require("fs-extra");
const path = require("path");
const Jimp = require("jimp");
const _ = require("lodash");
const Gauge = require("gauge");
const Themes = require("gauge/themes");
const Color = require("console-control-strings").color
const ourTheme = Themes.newTheme(themes({ hasUnicode: true, hasColor: true }), {
  progressbarTheme: {
    preProgressbar: "⸨",
    postProgressbar: "⸩",
    preComplete: Color("bgBlue", "brightBlue"),
    complete: "⠂",
    remaining: "░",
    postComplete: Color("reset"),
    preRemaining: Color("bgBrightBlack", "brightBlack"),
    postRemaining: Color("reset")
  },
  activityIndicatorTheme: "⣾⣽⣻⢿⡿⣟⣯⣷",
  preSubsection: "┉"
});

// helpers

const display = {
  info: (str) => {
    console.info(str);
  },
  success: (str) => {
    str = " " + "✔".green + " " + str;
    console.log(str);
  },
  error: (str) => {
    str = " " + "✗".red + " " + str;
    console.error(str.red);
  },
  header: (str) => {
    console.log("");
    console.log(str.cyan);
  }
};

// app main letiables and constants

const PLATFORMS = {
  "android": {
    definitions: ["./platforms/icons/android", "./platforms/splash/android"]
  },
  "ios": {
    definitions: ["./platforms/icons/ios", "./platforms/splash/ios"]
  },
  "windows": {
    definitions: ["./platforms/icons/windows", "./platforms/splash/windows"]
  },
  "blackberry10": {
    definitions: ["./platforms/icons/blackberry10"]
  }
};
const ICON_WIDTH = 1024;
const SPLASH_WIDTH = 2732;

let g_imageObjects;
let g_selectedPlatforms = [];

// app functions

const check = (settings) => {
  display.header("Checking files and directories");

  return checkPlatforms(settings)
    .then((selPlatforms) => g_selectedPlatforms = selPlatforms)
    .then(() => getImages(settings))
    .then((iobjs) => {
      g_imageObjects = iobjs;
    })
    .then(() => checkOutPutDir(settings));
};

const checkPlatforms = (settings) => {
  const platformsKeys = _.keys(PLATFORMS);

  if (!settings.platforms || !Array.isArray(settings.platforms)) {
    display.success("Processing files for all platforms");
    return Q.resolve(platformsKeys);
  }

  const platforms = settings.platforms;
  const platformsToProcess = [];
  const platformsUnknown = [];

  platforms.forEach(platform => {
    if (_.find(platformsKeys, (p) => platform === p)) {
      platformsToProcess.push(platform);
    } else {
      platformsUnknown.push(platform);
    }
  });

  if (platformsUnknown.length > 0) {
    display.error("Bad platforms: " + platformsUnknown);
    return Q.reject("Bad platforms: " + platformsUnknown);
  }

  display.success("Processing files for: " + platformsToProcess);
  return Q.resolve(platformsToProcess);
};

const getImages = (settings) => {
  const checkIconFile = (iconFileName) => {
    const defer = Q.defer();

    Jimp.read(iconFileName)
    .then((image) => {
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      if (width === ICON_WIDTH && width === height) {
        display.success(`Icon file ok (${width}x${height})`);
        defer.resolve(image);
      } else {
        display.error(`Bad icon file (${width}x${height})`);
        defer.reject("Bad image format");
      }
    })
    .catch((err) => {
      display.error("Could not load icon file");
      defer.reject(err);
    });

    return defer.promise;
  };

  const checkSplashFile = (splashFileName) => {
    const defer = Q.defer();

    Jimp.read(splashFileName)
    .then((image) => {
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      if (width === SPLASH_WIDTH && width === height) {
        display.success(`Splash file ok (${width}x${height})`);
        defer.resolve(image);
      } else {
        display.error(`Bad splash file (${width}x${height})`);
        defer.reject("Bad image format");
      }
    })
    .catch((err) => {
      display.error("Could not load splash file");
      defer.reject(err);
    });

    return defer.promise;
  };

  const imageObjects = {
    icon: null,
    splash: null
  };

  let promise = Q.resolve();

  if (settings.makeicon) {
    promise = promise.then(() => checkIconFile(settings.iconfile))
    .then((image) => {
      imageObjects.icon = image;
    });
  }
  if (settings.makesplash) {
    promise = promise.then(() => checkSplashFile(settings.splashfile))
    .then((image) => {
      imageObjects.splash = image;
    });
  }

  return promise.then(() => {
    return imageObjects;
  });
};

const checkOutPutDir = (settings) => {
  const dir = settings.outputdirectory;

  return fs.pathExists(dir)
  .then((exists) => {
    if (exists) {
      display.success("Output directory ok (" + dir + ")");
    } else if(!exists && settings.makedir === true) {
      // make
      display.header("Creating directory (" + dir + ")");
      fs.mkdir(path.join(__dirname, dir), (err) => {
        if (err) {
          throw ("Output directory could not be created: " + dir);
        }
        display.success("Directory created successfully!");
      });
    } else {
      display.error("Output directory not found (" + dir + ")");
      throw ("Output directory not found: " + dir);
    }
  });
};

const generateForConfig = (imageObj, settings, config) => {
  const platformPath = path.join(settings.outputdirectory, config.path);

  const transformIcon = (definition) => {
    const defer = Q.defer();
    const image = imageObj.icon.clone();
    const outputFilePath = path.join(platformPath, definition.name);

    image.resize(definition.size, definition.size)
    .write(outputFilePath,
      (err) => {
        if (err) defer.reject(err);
        //display.info("Generated icon file for " + outputFilePath);
        defer.resolve();
    });
    return defer.promise;
  };

  const transformSplash = (definition) => {
    const defer = Q.defer();
    const image = imageObj.splash.clone();
    const x = (image.bitmap.width - definition.width) / 2;
    const y = (image.bitmap.height - definition.height) / 2;
    const width = definition.width;
    const height = definition.height;

    const outputFilePath = path.join(platformPath, definition.name);

    image.crop(x, y, width, height)
    .write(outputFilePath,
      (err) => {
        if (err) defer.reject(err);
        //display.info("Generated splash file for " + outputFilePath);
        defer.resolve();
    });
    return defer.promise;
  };

  return fs.ensureDir(platformPath)
  .then(() => {
    const definitions = config.definitions;
    const sectionName = "Generating " + config.type + " files for " + config.platform;
    const definitionCount = definitions.length;
    let progressIndex = 0;

    const gauge = new Gauge();
    gauge.setTheme(ourTheme);
    gauge.show(sectionName, 0);

    return Q.mapSeries(definitions, (def) => {
      let transformPromise = Q.resolve();
      transformPromise = transformPromise.then(() => {
        progressIndex++;
        const progressRate = progressIndex / definitionCount;
        gauge.show(sectionName, progressRate);
        gauge.pulse(def.name);
      });
      switch (config.type) {
        case "icon":
        transformPromise = transformPromise.then(() => transformIcon(def));
        break;
        case "splash":
        transformPromise = transformPromise.then(() => transformSplash(def));
        break;
      }
      return transformPromise;
    }).then(() => {
      gauge.disable();
      display.success("Generated " + config.type + " files for " + config.platform);
    }).catch((err) => {
      gauge.disable();
      throw (err);
    });
  });
};

const generate = (imageObj, settings) => {
  display.header("Generating files");
  const configs = [];

  g_selectedPlatforms.forEach((platform) => {
    PLATFORMS[platform].definitions.forEach((def) => configs.push(require(def)));
  });

  const filteredConfigs = _.filter(configs, (config) => {
    if (config.type === "icon" && settings.makeicon) {
      return true;
    }
    if (config.type === "splash" && settings.makesplash) {
      return true;
    }
    return false;
  });

  return Q.mapSeries(filteredConfigs, (config) => {
    return generateForConfig(imageObj, settings, config);
  });
};

const catchErrors = (err) => {
  if (err) {
    console.error("Error: ", err);
  }
};

// cli helper configuration

const processList = (val) => {
  return val.split(",");
};

const pjson = require("./package.json");
program
.version(pjson.version)
.description(pjson.description)
.option("-i, --icon [optional]", "optional icon file path (default: ./resources/icon.png)")
.option("-s, --splash [optional]", "optional splash file path (default: ./resources/splash.png)")
.option("-p, --platforms [optional]", "optional platform token comma separated list (default: all platforms processed)", processList)
.option("-o, --outputdir [optional]", "optional output directory (default: ./resources/)")
.option("-I, --makeicon [optional]", "option to process icon files only")
.option("-S, --makesplash [optional]", "option to process splash files only")
.option("-m, --makedir [optional]", "option to create output dir")
.option("-g, --genconfig [optional]", "option to generate a config")
.parse(process.argv);

// app settings and default values

const g_settings = {
  iconfile: program.icon || path.join(".", "resources", "icon.png"),
  splashfile: program.splash || path.join(".", "resources", "splash.png"),
  platforms: program.platforms || undefined,
  outputdirectory: program.outputdir || path.join(".", "resources"),
  makeicon: program.makeicon || (!program.makeicon && !program.makesplash) ? true : false,
  makesplash: program.makesplash || (!program.makeicon && !program.makesplash) ? true : false,
  makedir: program.makedir ? true : false,
  generateConfig: program.generateConfig ? true : false
};

// app entry point

console.log("***************************".blue);
console.log("cordova-res-generator " + (pjson.version).green);
console.log("***************************".blue);

const printConfig = (settings) => {
  if (settings.generateConfig) {
    display.header("Generating Config");

    const configs = [];

    g_selectedPlatforms.forEach((platform) => {
      PLATFORMS[platform].definitions.forEach((def) => configs.push(require(def)));
    });

    const configsByPlatform = {};
    configs.forEach((config) => {
      if (!configsByPlatform[config.platform]) {
        configsByPlatform[config.platform] = [];
      }
      configsByPlatform[config.platform].push(config);
    });
    let platformName;
    for (platformName in configsByPlatform) {
      console.log(`<platform name="${platformName}">`);
      configsByPlatform[platformName].forEach((config) => {
        if (config.type == "icon" && settings.makeicon) {
          config.definitions.forEach((def) => {
            const path = `${settings.outputdirectory}/${config.path}${def.name}`;
            let additionalProps = "";
            if (platformName == "android"){
              additionalProps = ` density="${def.comment}" `;
            } else {
              additionalProps = ` width="${def.size}" height="${def.size}" `;
            }
            if (!def.ignore_config){
              console.log(`  <icon src="${path}" ${additionalProps}/>`);
            }
          });
        }

        if (config.type == "splash" && settings.makesplash) {
          config.definitions.forEach((def) => {
            const path = `${settings.outputdirectory}/${config.path}${def.name}`;
            let additionalProps = "";
            if (platformName == "android"){
              additionalProps = ` density="${def.comment}" `;
            } else {
              additionalProps = ` width="${def.width}" height="${def.height}" `;
            }
            if (!def.ignore_config){
              console.log(`  <splash src="${path}" ${additionalProps}/>`);
            }
          });
        }
      })
      console.log(`</platform>`);
    }
  }
};

check(g_settings)
.then(() => generate(g_imageObjects, g_settings))
.then(() => printConfig(g_settings))
.catch((err) => catchErrors(err));
