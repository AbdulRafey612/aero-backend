// Create a new express server
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import Minio from 'minio';
const express = require('express');
const app = express.Router();
const path = require('path');
const bodyParser = require("body-parser");
const archiver = require('archiver');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors')
const fsExtra = require('fs-extra');
// Sets default config to development node
// const config = require('config');
// Get config variables
const awsConfig = {
    bucketName: 'old-bucket'
};
// Create S3 service object
import { minioClient } from '../db.js';
var cos = minioClient;
// Store the list of promised cloud objects
var promiseList = [];
// Multer to upload the files to the server
var fileName = [];
// Sets the response content type
const ContentType = 'application/octet-stream';
// MULTER CONFIG: To get file photos to temp server storage
const multerConfig = {
    // Specify disk storage (another option is memory)
    storage: multer.diskStorage({

        // Specify destination
        destination: function (req, file, next) {
            if (!fs.existsSync("./temp/")) {
                fs.mkdirSync("./temp/");
            }
            next(null, './temp');
        },
        // Specify the filename to be unique
        filename: function (req, file, next) {
            fileName.push(file.originalname);
            next(null, file.originalname);
        }
    }),
    // Filter out and prevent non-image files.
    fileFilter: function (req, file, next) {
        next(null, true);
    }
};

// Parse incoming request bodies in a middleware
// app.use(bodyParser.urlencoded({
//     extended: true
// }));
// app.use(bodyParser.json());
// app.use(cors());
app.use('/', async function (req, res, next){
    console.log(req.body);
    const bucketName = req.body.userId;
    if(req.body.userId != undefined){
    try {
        // Check if the bucket already exists
        const exists = await minioClient.bucketExists(bucketName);
        console.log("This is the bucket exist var",exists);
        if (!exists) {
          // Bucket doesn't exist, create it
          await minioClient.makeBucket(bucketName);
    
          console.log(`Bucket '${bucketName}' created successfully.`);
        } else {
          console.log(`Bucket '${bucketName}' already exists.`);
        }
      } catch (error) {
        console.error('Error creating bucket:', error);
      }
        awsConfig.bucketName = req.body.userId;
    }
    
    next();
})
/**
 * Gets the imageUrl from the client
 */
app.get('/GetImage', function (req, res) {
    // var slashReplaced = req.query.path.replace(/\//,'');
    // console.log(slashReplaced);
    var relativeImagePath = req.query.path.split("/").length > 1 ? req.query.path : "/" + req.query.path;
    console.log(relativeImagePath);
    cos.getObject(awsConfig.bucketName, relativeImagePath.substr(1, relativeImagePath.length),function(err, dataStream) {
        if (err) {
            return console.log(err)
        }
        const chunks = [];
        dataStream.on('data',function (data){
            chunks.push(data);
        })
        dataStream.on('end',function (data) {
            const fileData = Buffer.concat(chunks);
            res.writeHead(200, { 'Content-type': 'image/jpg' });
            res.end(fileData);
        });
    });
});

/**
 * Handles the upload request
 */
app.post('/Upload', multer(multerConfig).any('uploadFiles'), function (req, res) {
    if (!fs.existsSync("./temp/")) {
        fs.mkdirSync("./temp/");
    }
    for (var index = 0; index < fileName.length; index++) {
        var id = index;
        var data = fs.readFileSync("./temp/" + fileName[id]);
        var uploadedFileName = fileName[id];
        //Old Code
        // promiseList.push(new Promise((resolve, reject) => {
        //     cos.putObject({
        //         Bucket: awsConfig.bucketName,
        //         Key: (req.body.path + uploadedFileName).substr(1, (req.body.path + uploadedFileName).length),
        //         Body: Buffer.from(data, 'base64'),
        //         ContentType: ContentType
        //     }, function (data) {
        //         resolve();
        //     })
        // }));
        //Newer One
        promiseList.push(new Promise((resolve, reject) => {
            minioClient.putObject(
                awsConfig.bucketName,
                req.body.path + uploadedFileName,
                Buffer.from(data, 'base64'),
                {
                    'Content-Type': ContentType
                },
                function (err, etag) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        }));
        

    }
    Promise.all(promiseList).then(function (data) {
        res.send('Success');
        fileName = [];
        fsExtra.emptyDir("./temp")
            .then(() => {
                fs.rmdirSync("./temp")
            })
            .catch(err => {
                console.error(err)
            })
    });
});

/**
 * Function to get the folder
 */
var getFolder = (function () {
    function buildTree(tree, parts) {
        console.log("This is the tree and parts",tree,parts);
        var lastDirectory = 'root';
        var directoryPath = '';
        parts.forEach(function (part) {
            console.log("Parts iteration:",part);
            var name = part.trim();
            if (!name || !!name.match(/^\/$/)) {
                return;
            }
            if (name.indexOf('.') === -1) {
                lastDirectory = name;
                directoryPath += lastDirectory + '/';
                if (!tree[name]) {
                    tree[directoryPath] = {
                        path: directoryPath,
                        files: []
                    };
                }
            } else {
                if (!tree[name]) {
                    tree[directoryPath] = {
                        path: directoryPath,
                        files: []
                    };
                }
                tree[directoryPath].files.push(name);
            }
        });
    }

    return function init(paths) {
        var tree = {
            root: {
                path: '',
                files: []
            }
        };
        //Commented because producing error when copying folder
        // if(paths != null){
        //     paths.forEach(function (pat) {
        //         buildTree(tree, pat.name.split('/'));
        //     });
        // }
        console.log("This is the tree right before returning ",tree);
        return tree;
    };
}());

/**
 * Downloads a file(s) or folder(s)
 */
app.post('/Download', function (req, res) {
    if (!fs.existsSync("./temp/")) {
        fs.mkdirSync("./temp/");
    }
    var downloadObj = JSON.parse(req.body.downloadInput);
    if (downloadObj.names.length === 1 && downloadObj.data[0].isFile) {
        // cos.getObject({
        //     Bucket: awsConfig.bucketName,
        //     Key: downloadObj.names[0],
        // }).promise().then(function (data) {
        //     var bitmap = new Buffer(data.Body, 'base64');
        //     // Write buffer to file
        //     fs.writeFileSync("./temp/" + downloadObj.names[0], bitmap);
        //     res.download("./temp/" + downloadObj.names[0]);
        //     fsExtra.emptyDir("./temp")
        //         .then(() => {
        //             fs.rmdirSync("./temp")
        //         })
        //         .catch(err => {
        //         });
        // });
        minioClient.getObject(
            awsConfig.bucketName,
            downloadObj.names[0],
            function (err, dataStream) {
              if (err) {
                // Handle error
                console.error(err);
              } else {
                var fileStream = fs.createWriteStream("./temp/" + downloadObj.names[0]);
                dataStream.pipe(fileStream);
                fileStream.on("finish", function () {
                  fileStream.close();
                  res.download("./temp/" + downloadObj.names[0], function (err) {
                    if (err) {
                      // Handle download error
                      console.error(err);
                    } else {
                      // Cleanup temporary files
                      fsExtra.emptyDir("./temp")
                        .then(() => {
                          fs.rmdirSync("./temp");
                        })
                        .catch((err) => {
                          // Handle cleanup error
                          console.error(err);
                        });
                    }
                  });
                });
              }
            }
          );
    } else {
        // var archive = archiver('zip', {
        //     gzip: true,
        //     zlib: { level: 9 } // Sets the compression level.
        // });
        // downloadObj.data.forEach(function (item, index, downloadObj) {
        //     var downloadObj = JSON.parse(req.body.downloadInput);
        //     archive.on('error', function (err) {
        //         throw err;
        //     });
        //     if (item.isFile) {
        //         cos.getObject({
        //             Bucket: awsConfig.bucketName,
        //             Key: item.name,
        //         }).promise().then(function (data) {
        //             var bitmap = new Buffer(data.Body, 'base64');
        //             folder = item.name;
        //             fs.writeFileSync("./temp/" + item.name, bitmap);
        //         });
        //     }
        //     else {
        //         cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/", Prefix: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/", Marker: "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/" }, function (err, data) {
        //             var tree;
        //             if (data.Contents.length > 0) {
        //                 tree = getFolder(data.Contents);
        //             } else {
        //                 tree = getFolder([{ "Key": data.Prefix }]);
        //             }
        //             for (item in tree) {
        //                 if (tree[item].path !== "" && !fs.existsSync("./temp/" + tree[item].path)) {
        //                     fs.mkdirSync("./temp/" + tree[item].path);
        //                 }
        //             }
        //             if (data.Contents.length > 0) {
        //                 for (var i = 0; i < data.Contents.length; i++) {
        //                     promiseList.push(new Promise((resolve, reject) => {
        //                         cos.getObject({
        //                             Bucket: awsConfig.bucketName,
        //                             Key: data.Contents[i].Key
        //                         }).promise().then(function (data) {
        //                             var tempPath = path.join("./temp/", data.$response.request.params.Key);;
        //                             var bitmap = new Buffer(data.Body.buffer, 'base64');
        //                             if (path.extname(tempPath) != "") {
        //                                 fs.writeFileSync(tempPath, bitmap);
        //                             }
        //                             resolve(tempPath);
        //                         });
        //                     }));
        //                 }
        //             }

        //             Promise.all(promiseList).then(data => {
        //                 if (promiseList.length > 0) {
        //                     var archive = archiver('zip', {
        //                         gzip: true,
        //                         zlib: { level: 9 } // Sets the compression level.
        //                     });
        //                     var output = fs.createWriteStream('./Files.zip');
        //                     archive.directory('./temp/', "zip");
        //                     archive.pipe(output);
        //                     archive.finalize();
        //                     output.on('close', function () {
        //                         var stat = fs.statSync(output.path);
        //                         res.writeHead(200, {
        //                             'Content-disposition': 'attachment; filename=Files.zip; filename*=UTF-8',
        //                             'Content-Type': 'APPLICATION/octet-stream',
        //                             'Content-Length': stat.size
        //                         });
        //                         var fileStream = fs.createReadStream(output.path);
        //                         fileStream.pipe(res);
        //                         fsExtra.emptyDir("./temp")
        //                             .then(() => {
        //                                 fs.rmdirSync("./temp")
        //                             })
        //                             .catch(err => {
        //                                 console.error(err)
        //                             })
        //                     });
        //                 }
        //                 promiseList = [];
        //             });
        //         }.bind(this));
        //     }
        // });
        var archive = archiver('zip', {
            gzip: true,
            zlib: { level: 9 } // Sets the compression level.
          });
          downloadObj.data.forEach(async function (item, index, downloadObj) {
            var downloadObj = JSON.parse(req.body.downloadInput);
            archive.on('error', function (err) {
              throw err;
            });
            if (item.isFile) {
                console.log("You are in the multiple file download section");
                await new Promise((resolve, reject) => {
                minioClient.getObject(
                    awsConfig.bucketName,
                    item.name,
                    function (err, dataStream) {
                    if (err) {
                        // Handle error
                        console.error(err);
                    } else {
                        console.log(
                            "made it to the file stream",dataStream
                        )
                        var fileStream = fs.createWriteStream("./temp/" + item.name);
                        console.log(dataStream.pipe(fileStream));
                        fileStream.on("finish", function () {
                        console.log("File stream finished");
                        fileStream.close();
                        resolve();
                        });   
                    }
                    }
                );
                })
            } else {
              minioClient.listObjects(
                awsConfig.bucketName,
                "" + downloadObj.path.substr(1, downloadObj.path.length) + downloadObj.data[index].name + "/",
                true
              )
                .on('data', function (obj) {
                  var tempPath = path.join("./temp/", obj.name);
                  if (path.extname(tempPath) != "") {
                    fs.writeFileSync(tempPath, obj.data);
                  }
                })
                .on('end', function () {
                  var archive = archiver('zip', {
                    gzip: true,
                    zlib: { level: 9 } // Sets the compression level.
                  });
                  var output = fs.createWriteStream('./Files.zip');
                  archive.directory('./temp/', "zip");
                  archive.pipe(output);
                  archive.finalize();
                  output.on('close', function () {
                    var stat = fs.statSync(output.path);
                    res.writeHead(200, {
                      'Content-disposition': 'attachment; filename=Files.zip; filename*=UTF-8',
                      'Content-Type': 'APPLICATION/octet-stream',
                      'Content-Length': stat.size
                    });
                    var fileStream = fs.createReadStream(output.path);
                    fileStream.pipe(res);
                    fsExtra.emptyDir("./temp")
                      .then(() => {
                        fs.rmdirSync("./temp")
                      })
                      .catch(err => {
                        console.error(err)
                      })
                  });
                });
            }
          });
          
    }
});

/**
 * Function to get the recursive file details
 */
function recursiveFileDetails(prefix) {
    return new Promise((resolve, reject) => {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: prefix, Marker: prefix }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Prefix
                    }).promise().then(function (err, data) {
                        resolve(data);
                    })
                }));
                if (data.CommonPrefixes.length == 0) {
                } else {
                    recursiveFileDetails(file.Prefix)
                }
            })
            data.Contents.forEach(file => {
                getDataContent(file);
                if (data.Contents.length == 0) {
                } else {
                    recursiveFileDetails(file.Key)
                }
            })
            if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: data.Prefix
                    }).promise().then(function (data) {
                        resolve(data);
                    })
                }));
            }
        });
    });
}

/**
 * Function to get the size in kb, MB
 */
function getSize(size) {
    var sizeValue;
    if (size < 1024) sizeValue = size + ' B';
    else if (size < 1024 * 1024) sizeValue = (size / 1024).toFixed(2) + ' KB';
    else if (size < 1024 * 1024 * 1024) sizeValue = (size / 1024 / 1024).toFixed(2) + ' MB';
    else sizeValue = (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    return sizeValue;
}

/**
 * Function to get the data prefixes
 */
function getDataPrefixes(file) {
    promiseList.push(new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: file.Prefix
        }).promise().then(function (data) {
            recursiveFileDetails(file.Prefix).then(function (data) {
                resolve(data);
            });
            resolve(data);
        })
    }));
}

/**
 * Function to get the data content
 */
function getDataContent(file) {
    promiseList.push(new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: awsConfig.bucketName,
            Key: file.Key
        }).promise().then(function (data) {
            resolve(data);
        });
    }));
}

/**
 * Function to get the file details
 */
function fileDetails(req, res, isNamesAvailable, isMultipleFiles) {
    var details = {};
    var names = [];
    var size = 0;
    var modifiedDate = new Date();
    var response;

    Promise.all(promiseList).then(value => {
        if (value) {
            for (var i = 0; i < value.length; i++) {
                if (value[i]) {
                    size += value[i].Body ? value[i].Body.byteLength : 0;
                    modifiedDate = value[i].LastModified;
                }
            }
        }
        if (isMultipleFiles) {
            req.body.names.forEach(function (name) {
                if (name.split("/").length > 0) {
                    names.push(name.split("/")[name.split("/").length - 1]);
                }
                else {
                    names.push(name);
                }
            });

            details.name = names.join(", ");
            details.multipleFiles = true;
            details.type = "Multiple Types";
            if (req.body.data[0].path == "") {
                details.location = "Various Folders"
            } else {
                details.location = (awsConfig.bucketName + req.body.data[0].filterPath).substr(0, (awsConfig.bucketName + req.body.data[0].filterPath).length - 1);
            }
        } else {
            details.name = req.body.names[0];
            details.type = path.extname(details.name);
            if (isNamesAvailable) {
                if (req.body.data[0].filterPath == "") {
                    details.location = (req.body.data[0].filterPath + req.body.names[0]).substr(0, (req.body.data[0].filterPath + req.body.names[0].length));
                } else {
                    details.location = awsConfig.bucketName + req.body.data[0].filterPath + req.body.names[0];
                }
            } else {
                details.location = (awsConfig.bucketName + req.body.data[0].filterPath).substr(0, (awsConfig.bucketName + req.body.data[0].filterPath).length - 1);
            }
        }
        details.size = getSize(size);
        details.isFile = req.body.data[0].isFile;
        details.modified = modifiedDate;
        details.created = req.body.data[0].dateCreated;
        response = { details: details };
        if (value.length == promiseList.length) {
            responseDetails(res, response);
        }
    });
}

/**
 * Function to get the file details
 */
function getFileDetails(req, res) {
    var nameValues = [];
    promiseList = [];
    var reqObj = req;
    var isNamesAvailable = req.body.names.length > 0 ? true : false;
    var isMultipleFiles = false;
    if (req.body.names.length == 0 && req.body.data != 0) {
        req.body.data.forEach(function (item) {
            nameValues.push(item.name);
        });
        req.body.names = nameValues;
    }
    if (req.body.names.length == 1 && isNamesAvailable) {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[0].name + "/" }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                getDataPrefixes(file);
            });
            data.Contents.forEach(file => {
                getDataContent(file);
            });
            if (data.Contents.length == 0 && data.CommonPrefixes.length == 0) {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.getObject({
                        Bucket: awsConfig.bucketName,
                        Key: reqObj.body.data[0].isFile ? data.Prefix.substr(0, data.Prefix.length - 1) : data.Prefix
                    }).promise().then(function (data) {
                        resolve(data);
                    })
                }));
            }
            fileDetails(req, res, isNamesAvailable, isMultipleFiles);
        });
    } else if (!isNamesAvailable) {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length), Prefix: "" + req.body.path.substr(1, req.body.path.length), Marker: "" + req.body.path.substr(1, req.body.path.length) }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                getDataPrefixes(file);
            });
            data.Contents.forEach(file => {
                getDataContent(file);
            });
            fileDetails(req, res, isNamesAvailable, isMultipleFiles);
        });
    } else {
        isMultipleFiles = true;
        req.body.data.forEach(function (value, i, data) {
            cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/", Prefix: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/", Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/" }, function (err, data) {
                data.CommonPrefixes.forEach(file => {
                    getDataPrefixes(file);
                });
                data.Contents.forEach(file => {
                    getDataContent(file);
                });
                if (data.Contents.length == 0 && data.CommonPrefixes.length == 0) {
                    var reqObj = req;
                    var dataPrefix = (data.Prefix.substr(0, data.Prefix.length - 1)).substr((data.Prefix.substr(0, data.Prefix.length - 1)).lastIndexOf("/") + 1, (data.Prefix.length))
                    var keyValue;
                    if (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath != "") {
                        keyValue = reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].isFile ?
                            (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).substr(1, (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).length) :
                            (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).substr(1, (reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].filterPath + reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].name).length) + "/"
                    } else {
                        keyValue = reqObj.body.data[reqObj.body.data.findIndex(x => x.name == dataPrefix)].isFile ? data.Prefix.substr(0, data.Prefix.length - 1) : data.Prefix;
                    }
                    promiseList.push(new Promise((resolve, reject) => {
                        cos.getObject({
                            Bucket: awsConfig.bucketName,
                            Key: keyValue
                        }).promise().then(function (data) {
                            resolve(data);
                        })
                    }));
                }
                fileDetails(req, res, isNamesAvailable, isMultipleFiles);
            });
        })
    }
}

/**
 * Function to delete the recursive files.
 */
function recursiveFileDelete(prefix) {
    return new Promise((resolve, reject) => {
        cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: prefix, Marker: prefix }, function (err, data) {
            data.CommonPrefixes.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.deleteObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Prefix
                    }, function (data) {
                        resolve(data);
                    })
                }));
                if (data.CommonPrefixes.length == 0) {
                    resolve(data);
                } else {
                    recursiveFileDelete(file.Prefix)
                }
            })
            data.Contents.forEach(file => {
                promiseList.push(new Promise((resolve, reject) => {
                    cos.deleteObject({
                        Bucket: awsConfig.bucketName,
                        Key: file.Key
                    }, function (data) {
                        resolve(data);
                    })
                }));
                if (data.Contents.length == 0) {
                    resolve(data);
                } else {
                    recursiveFileDelete(file.Key)
                }
            })
            if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                resolve(data);
            }
        });
    });
}

/**
 * Function to delete the file
//  */
function deleteFile(req, name, res) {
    var  res = res;
  
    return new Promise((resolve, reject) => {
        promiseList = [];
        if (name) {
            req.body.names = [name];
        }
        for (var i = 0; i < req.body.names.length; i++) {
            promiseList.push(new Promise((resolve, reject) => {
                if(!req.body.data[i].isFile){
                    var data = [];
                    var folderPath = req.body.path + req.body.data[i].name;
                    const objectsStream = minioClient.listObjects(awsConfig.bucketName, folderPath, true);

                    objectsStream.on('data', async function (obj) {
                      const objectName = obj.name;
                  
                      // Delete the object
                      await minioClient.removeObject(awsConfig.bucketName, objectName);
                  
                      console.log(`Object deleted: ${objectName}`);
                    });
                  
                    objectsStream.on('error', function (err) {
                      console.error('Error listing objects:', err);
                    });
                  
                    objectsStream.on('end', function () {
                      console.log('Folder deletion completed.');
                    });
                    resolve();
                } else {
                    cos.removeObject(awsConfig.bucketName,((req.body.path + req.body.names[i] + (req.body.data[i].isFile ? "" : "/")).substr(1, (req.body.path + req.body.names[i] + (req.body.data[i].isFile ? "" : "/")).length)), function (err) {
                    if(err){
                        return console.log('Unable to remove object', err)
                    } else{
                        resolve(1);
                    }
                    })
                }
                
            }));
            //Prefix: "" + "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/",
            //Marker: "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/" }
            var data = [] 
            var stream = cos.listObjects( awsConfig.bucketName,  "" + "" + req.body.path.substr(1, req.body.path.length) + req.body.data[i].name + "/",false)
            stream.on('data', function(obj) { data.push(obj) } )
            
            
               
            stream.on("end", function (err, data) {
            //     data.CommonPrefixes.forEach(file => {
            //         promiseList.push(new Promise((resolve, reject) => {
            //             cos.deleteObject({
            //                 Bucket: awsConfig.bucketName,
            //                 Key: file.Prefix
            //             }, function (data) {
            //                 recursiveFileDelete(file.Prefix).then(function (data) {
            //                     resolve(2);
            //                 });
            //                 resolve(3);
            //             })
            //         }));
            //     });
            //     data.Contents.forEach(file => {
            //         promiseList.push(new Promise((resolve, reject) => {
            //             cos.deleteObject({
            //                 Bucket: awsConfig.bucketName,
            //                 Key: file.Key
            //             }, function (data) {
            //                 resolve(4);
            //             })
            //         }));
            //     });
                Promise.all(promiseList).then(data => {
                    promiseList = [];
                    console.log("Hello WOrld from Promise details");
                    if (name == null) {
                        var response = {
                            files: [{ name: req.body.names[0] }], error: null,
                            details: null, cwd: null
                        };
                        response = JSON.stringify(response);
                        // res.setHeader('Content-Type', 'application/json');

                        setTimeout(function () {
                            if ( res!= null &&!res.headersSent) {
                                res.json(response);
                            }
                        }.bind(this), 2000)
                    }
                    resolve(data);
                });
            });
        }
    })
}

/**
 * Function to check the child elements
 */
//Old Implementation
// function hasChild(fileName) {
//     return new Promise((resolve, reject) => {
//         cos.listObjects( awsConfig.bucketName, fileName, true)
//         .on('data', function (obj) {
//             // Handle each object returned
//             console.log('Object:', obj.name);
//          })  
//         .on('end',function(data) {
//             if (data.length > 0) {
//                 resolve(true);
//             } else {
//                 resolve(false);
//             }
//         });
//     });
// }
//New Implementation
function hasChild(fileName) {
    return new Promise((resolve, reject) => {
        let hasChildObjects = false;

        minioClient.listObjects(awsConfig.bucketName, fileName, true)
            .on('data', function (obj) {
                // Handle each object returned
                console.log('Object:', obj.name);
                hasChildObjects = true;
            })
            .on('end', function () {
                resolve(hasChildObjects);
            })
            .on('error', function (err) {
                reject(err);
            });
    });
}

/**
 * Function to update the response
 */
function responseDetails(res, response) {
    response = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

   /**
   * Function to initialize the current working directory objects
   */
   function getCWDObjects() {
    var cwd = {};
    cwd.size = 0;
    cwd.isFile = false;
    cwd.dateModified = new Date();
    cwd.dateCreated = new Date();       
    cwd.type = "";
    return cwd;
}

   /**
   * Function to get the error details
   */
   function getErrorDetails(req, res) {
    var errorMsg = new Error();
    errorMsg.message = "A file or folder with the name " + req.body.name + " already exists.";
    errorMsg.code = "400";
    var response = { error: errorMsg };
    response = JSON.stringify(response);
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
}

/**
 * Function to moves file(s) or folder(s)
 */
 function copyMoveOperations(action, req, res) {
    var req = req;
    var res = res;
        console.log(req.body);
        if(action == "copy"){
            console.log("This length",req.body.length);
            for(let i=0;i<req.body.data.length;i++){
                if(!req.body.data[i].isFile){
                    //Copy Folder
                    promiseList.push(new Promise((resolve, reject) => {
                    var sourcePath = req.body.path + req.body.data[i].name + "/";
                    var targetPath = req.body.targetPath;

                    // var newName = targetPath + req.body.data[i].name;
                    console.log("This is the new name", targetPath);
                    var dataStream = minioClient.listObjects(awsConfig.bucketName, req.body.path +  req.body.data[i].name + "/", true);
                    console.log("Error hasn't occured yet");
                    dataStream.on('data', function (obj) {
                        const orignalSourceObject = obj.name;
                        const sourceObject = obj.name.replace(req.body.path.substr(1), "");

                        console.log("This is teh source Object",sourceObject);
                        // Build the target object path by replacing the source folder path with the target folder path
                        const targetObject = obj.name.replace(sourcePath, targetPath);
                    
                        // Copy the object to the target location
                        minioClient.copyObject(awsConfig.bucketName, targetPath + sourceObject , `${awsConfig.bucketName}/${orignalSourceObject}`);
                    
                        console.log(`Object copied: ${orignalSourceObject} -> ${sourceObject}`);
                      });
                    
                      dataStream.on('error', function (err) {
                        console.error('Error listing objects:', err);
                      });
                    
                      dataStream.on('end', function () {
                        console.log('Folder copy completed.');
                      });
                      resolve();
                    }));
                    // var tree = getFolder(req.body.data[i].name);
                    // console.log("This is the tree",tree);
                } else {
                    promiseList.push(new Promise((resolve, reject) => {
                        const copyConditions = new Minio.CopyConditions();
                        const newName =  req.body.targetPath.substr(1) + "/" + req.body.data[i].name;
                        const oldName =  "/"+ awsConfig.bucketName + req.body.path +req.body.data[i].name;
                        console.log("This is th eold name of the object",oldName);
                        minioClient.copyObject(awsConfig.bucketName,  newName , oldName, copyConditions,function (err, data) {
                            console.log("Good returned");
                            if (err) {
                            console.error('Error copying file:', err);
                            res.status(500).json({ message: 'Error copying file' });
                            } else {
                            console.log('File copied successfully');
                            }
                        });
                        resolve();
                    }));
                }
            }
        } else if(action == "move"){
            for(let i=0;i<req.body.data.length;i++){
                if(!req.body.data[i].isFile){
                    promiseList.push(new Promise((resolve, reject) => {
                        var sourcePath = req.body.path + req.body.data[i].name + "/";
                        var targetPath = req.body.targetPath;
                        // var newName = targetPath + req.body.data[i].name;
                        console.log("This is the new name", targetPath);
                        var dataStream = minioClient.listObjects(awsConfig.bucketName, req.body.path +  req.body.data[i].name + "/", true);
                        console.log("Error hasn't occured yet");
                        dataStream.on('data', function (obj) {
                            const orignalSourceObject = obj.name;
                            const sourceObject = obj.name.replace(req.body.path.substr(1), "");
                            console.log("This is teh source Object",sourceObject);
                            // Build the target object path by replacing the source folder path with the target folder path
                            const targetObject = obj.name.replace(sourcePath, targetPath);
                        
                            // Copy the object to the target location
                            minioClient.copyObject(awsConfig.bucketName, targetPath + sourceObject , `${awsConfig.bucketName}/${orignalSourceObject}`);
                        
                            console.log(`Object copied: ${orignalSourceObject} -> ${sourceObject}`);
                            });
                        
                            dataStream.on('error', function (err) {
                            console.error('Error listing objects:', err);
                            });
                        
                            dataStream.on('end', function () {
                            console.log('Folder copy completed.');
                            });
                            resolve();
                    }));
                } else {
                    promiseList.push(new Promise((resolve, reject) => {
                        const copyConditions = new Minio.CopyConditions();
                        const newName =  req.body.targetPath.substr(1) + "/" + req.body.data[i].name;
                        const oldName =  "/"+ awsConfig.bucketName + req.body.path +req.body.data[i].name;
                        minioClient.copyObject(awsConfig.bucketName,  newName , oldName, copyConditions,function (err, data) {
                            console.log("Good returned");
                            if (err) {
                                console.error('Error copying file:', err);
                                res.status(500).json({ message: 'Error copying file' });
                            }
                                // } else {
                            //     console.log('File copied successfully');
                            //     minioClient.removeObject(awsConfig.bucketName, oldName, function (err, data) {
                            //         if (err) {
                            //           console.error('Error removing source file:', err);
                            //         } else {
                            //           console.log('Source file removed successfully:', data);
                            //         }
                            //       });
                            // }
                        });
                        resolve();
                    }));
                }
            }
        }
        Promise.all(promiseList).then(data => {
            var cwd = getCWDObjects();
            var files = [];
            cwd.name = req.body.name;
            // No need of adding a forward slash at the end of path
            // console.log("The error has not occured yet", req.body.path.substr(1, req.body.path.length) + "/");
            hasChild(req.body.path.substr(1, req.body.path.length)).then(function (data) {
                console.log("hasChild executed successfully",hasChild);
                cwd.hasChild = data;
                cwd.type = "";
                files.push(cwd);
                promiseList = [];
                if (action == "move") {
                    console.log("We are here deleting folder", req.body.name);
                    deleteFile(req, req.body.name, null).then(function (data) {
                        console.log("Delete Folder successful");
                        var response = {
                            files: files, error: null,
                            details: null, cwd: null
                        };
                        responseDetails(res, response);
                    })
                } else {
                    console.log("The error has not occured yet part 2");
                    var response = {
                        files: files, error: null,
                        details: null, cwd: null
                    };
                    responseDetails(res, response);
                }
            });
        });
        
}
        
    


app.post('/', function (req, res) {
    req.setTimeout(0);

    // Action for copying file(s) or folder(s)
    if (req.body.action == "copy") {
        copyMoveOperations("copy", req, res);
    }

    // Action for moving file(s) or folder(s)
    if (req.body.action == "move") {
        copyMoveOperations("move", req, res);
    }

    // Action for getting file(s) or folder(s) details
    if (req.body.action == "details") {
        getFileDetails(req, res);
    }

    // Action to creates a new folder
    if (req.body.action == "create") {
        var key;
        var flag = 0;
        if (req.body.path == "/") {
            key = req.body.name + '/'
        } else {
            key = "" + req.body.path.substr(1, req.body.path.length) + req.body.name + "/";
        }
        key = "/" + key;
        console.log(key);
        var dataStream =   minioClient.listObjects(awsConfig.bucketName, req.body.path, false)
        
        dataStream.on("data",(data)=>{
            console.log(data);
            console.log("This is they ke",key);
            console.log(key.replace("/",""));
            console.log(key.replace("/","").localeCompare(data.prefix))
            console.log(key.replace("/","").localeCompare(key.replace) === 0);
            if(data.prefix != null && key.replace("/","").localeCompare(data.prefix) === 0){
                console.log("Name is a match");
                flag = 1;
               return getErrorDetails(req, res); 
            }
           
        });
        dataStream.on("end",function (err, dataStream) {

            console.log("Inside the callback",err,dataStream);
            // if (err != undefined) {
                console.log("ERROR");
                // '/newDir/'

              minioClient.putObject(awsConfig.bucketName, key, '', function (err, etag) {
                if (flag == 1) {
                  console.error('Error putting object:', err);
                  // Handle the error accordingly
                } else {
                    console.log("You are in the esle part");
                  const response = {
                    files: [{ name: req.body.name }],
                    error: null,
                    details: null,
                    cwd: null
                  };
                  responseDetails(res, response);
                }
              });
            // } else if (dataStream) {
            //   getErrorDetails(req, res);
            // }
          });
          
    }

    // Action to removes a file(s) or folder(s)
    if (req.body.action == "delete") {
        deleteFile(req, null, res);
    }

    // Action to renames a file(s) or folder(s)
    if (req.body.action === "rename") {
       
        const bucketName = awsConfig.bucketName;
        const { name, isFile } = req.body.data[0];
        const { path, newName } = req.body;
        const oldKey = path.substr(1) + name;
        const newKey = path.substr(1) + newName;
        var conds = new Minio.CopyConditions()
        var isResponseError;
        console.log("this is the req.body", req.body);
        // Rename a file
        if (isFile) {
            console.log("You are inside delete file block newKey & oldKey ",newKey);
            console.log(oldKey);
            minioClient.copyObject(bucketName, newKey, `/${bucketName}/${oldKey}`, conds, function (err, copyResult) {
            if (err) {
                console.error('Error renaming file:', err);
                // Handle the error accordingly
            } else {
                minioClient.removeObject(bucketName, oldKey, function (err, removeResult) {
                if (err) {
                    console.error('Error removing original file:', err);
                    // Handle the error accordingly
                } else {
                    console.log('File renamed successfully.');
                    // Handle the success scenario
                    res.send('Success');
                }
                });
            }
            });
        }else {
            // Rename a folder (prefix)
            // Fetch all objects with the given prefix

            console.log("🚀 ~ file: storageRouterBackup.js:rename folder ~ isFile:", isFile)
            const folderChildPath  = req.body.path.substr(1) + name;
            console.log("🚀 ~ file: storageRouterBackup.js:1110 ~ folderChildPath:", folderChildPath)
            const listStream = minioClient.listObjects(bucketName, folderChildPath, true);

            listStream.on('data', function (obj) {
            const oldObjectKey = obj.name;
            console.log("🚀 ~ file: storageRouterBackup.js:1112 ~ oldObjectKey:", oldObjectKey)
            const newObjectKey = newKey + oldObjectKey.substr(oldKey.length);
            console.log("🚀 ~ file: storageRouterBackup.js:1113 ~ newObjectKey:", newObjectKey)
            var conds = new Minio.CopyConditions();
                // "old-bucket/Test/About/nice.PNG"
                console.log("🚀 ~ file: storageRouterBackup.js:1123 ~ `${bucketName}/${oldObjectKey}`:", `${bucketName}/${oldObjectKey}`)
            minioClient.copyObject(bucketName, newObjectKey, `${bucketName}/${oldObjectKey}`, conds, function (err, copyResult) {
                if (err) {
                console.error('Error renaming object:', err);
                // Handle the error accordingly
                } else {
                minioClient.removeObject(bucketName, oldObjectKey, function (err, removeResult) {
                    if (err) {
                    console.error('Error removing original object:', err);
                    // Handle the error accordingly
                    } else {
                    console.log('Object renamed successfully:', oldObjectKey);
                    // Handle the success scenario
                    }
                });
                }
            });
            });

            listStream.on('error', function (err) {
            console.error('Error listing objects:', err);
            isResponseError = true;
            // Handle the error accordingly
            });

            listStream.on('end', function () {
            console.log('Folder renamed successfully.');
            // Handle the success scenario
            });
        }
        
     

            Promise.all(promiseList).then(data => {
                var cwd = getCWDObjects();
                var files = [];
                cwd.name = req.body.newName;
                cwd.filterPath = req.body.path;
                hasChild(req.body.path.substr(1, req.body.path.length) + req.body.newName + "/").then(function (data) {
                    cwd.hasChild = data;
                    cwd.type = "";
                    files.push(cwd);
                    promiseList = [];
                    if (isResponseError) {
                        getErrorDetails(req, res)
                    } else {
                        response = {
                            files: files, error: null,
                            details: null, cwd: null
                        };
                        // responseDetails(res, response);
                        // setTimeout(function () {
                        //     deleteFile(req, req.body.name, null).then(function (data) {

                        //     });
    
                        // }, 3000);
                    }
                    // fsExtra.emptyDir("./temp")
                    //     .then(() => {
                    //         fs.rmdirSync("./temp")
                    //     })
                    //     .catch(err => {

                    //     })
                });
            });
        
    }

    // Action to searches a file
    if (req.body.action === 'search') {
        var searchString = req.body.searchString.replace(/\*/g, "");
        var files = [];
        var filterName = "";
      
        const objectsStream = minioClient.listObjectsV2(
          awsConfig.bucketName,
          req.body.path.substr(1, req.body.path.length),
          true,
          req.body.path.substr(1, req.body.path.length),
        );
      
        objectsStream.on('data', function (file) {
          if (file.name.indexOf(searchString) >= 0) {
            var cwd = {};
            var size = file.size;
            var dateModified = file.lastModified;
            filterName = "";
            file.name.split("/").forEach(function (value, index, array) {
              if (value.indexOf(searchString) >= 0) {
                if (path.extname(value) == "") {
                  cwd.type = "";
                  cwd.isFile = false;
                } else {
                  cwd.type = path.extname(value);
                  cwd.isFile = true;
                }
                cwd.name = value;
                cwd.size = size;
                cwd.dateModified = dateModified;
                cwd.dateCreated = new Date();
                cwd.filterPath = "/" + filterName;
                cwd.path = "";
                cwd.hasChild = false;
                if (files.findIndex((x) => x.name == cwd.name && x.filterPath == cwd.filterPath) < 0) {
                  files.push(cwd);
                }
              }
              filterName += value + "/";
            });
          }
        });
      
        objectsStream.on('end', function () {
          var response = { cwd: [], files: files };
          responseDetails(res, response);
        });
      
        objectsStream.on('error', function (err) {
          console.error('Error listing objects:', err);
          // Handle the error accordingly
        });
      }
      

    /**
    * Function to get the files list
    */
    async function getFilesList(req) {
        return new Promise((resolve, reject) => {
            var files = [];
            var commonFolders = [];
            var hasChildPromise = 0;
            console.log("This is the bucket name",awsConfig.bucketName.toString());
            if (req.body.path == "/") {
                //Changed Start
                var dataStream = cos.listObjects(awsConfig.bucketName,'',true);
                var dataArr = [];
                dataStream.on('data', function(data) {
                  console.log('Listing objects rn',data)
                
                  dataArr.push(data);
                   
                })                
                dataStream.on('end', function() {
                  console.log('Finished listing objects');
                  console.log("This is the req.body",req.body.path);
        
                  dataArr.forEach(file => {
                    console.log("File",file);
                    const parts = file.name.split('/');
                    if (parts.length > 1) {
                        if (!commonFolders.includes(parts[0])){
                            commonFolders.push(parts[0]);
                            var cwd = {};
                            cwd.name = parts[0];
                            cwd.size = file.size;
                            cwd.isFile = false;
                            cwd.filterPath = req.body.path; 
                            cwd.dateModified = file.lastModified;
                            cwd.dateCreated = file.lastModified;
                            // cwd.type = path.extname(cwd.name);
                            cwd.hasChild = true;
                            files.push(cwd);
                        }
                        return;
                    }

                    var cwd = {};
                    cwd.name = file.name;
                    cwd.size = file.size;
                    cwd.isFile = true;
                    cwd.filterPath = req.body.path;
                    cwd.dateModified = file.lastModified;
                    cwd.dateCreated = file.lastModified;
                    cwd.type = path.extname(cwd.name);
                    cwd.hasChild = false;
                    files.push(cwd);
                   });
                  console.log("These are all the files ",files);
                  resolve(files);
                   if (dataArr.length == 0) {
                        resolve([]);
                    }
                })
                //Changed End
                
               // cos.listObjects({ Bucket: awsConfig.bucketName.toString(), Delimiter: "/" }, function (err, data) {
               //      data.CommonPrefixes.forEach((file, index, array) => {
               //          var cwd = getCWDObjects();
               //          //Changed Start
               //          var prefixLength = file.name.lastIndexOf('/');
               //          cwd.name = file.Prefix.substr(prefixLength+1);
               //          //Changed End                       
               //          cwd.filterPath = req.body.path;
               //          cwd.hasChild = false;
               //          files.push(cwd);
               //          hasChild(file.Prefix).then(function (data) {
               //              hasChildPromise = hasChildPromise + 1;
               //              var cwd = getCWDObjects(file);
               //              cwd.name = file.Prefix.substr(0, file.Prefix.length - 1)
               //              files[files.findIndex(x => x.name == cwd.name)].hasChild = data;
               //              if (hasChildPromise == array.length) {
               //                  resolve(files);
               //              }
               //          })
               //      });

                   
                    
               //  });

            } else {
                var dataStream = cos.listObjects(awsConfig.bucketName, req.body.path.substr(1, req.body.path.length),true);
                var dataArr = [];
                dataStream.on('data', function(data) {
                    console.log('Listing objects rn',data)
                    dataArr.push(data);
                  })                
                  dataStream.on('end', function() {
                    console.log('Finished listing objects');
                    console.log("This is the req.body(cwd)",req.body.path);
          
                    dataArr.forEach(file => {
                    //   console.log("File",file);
                    //   file.name = file.name.replace(req.body.path.substr(1, req.body.path.length), "").replace("/", "");
                    //   console.log(file.name);
                    //   const parts = file.name.split('/');
                    //   console.log(parts);

                        //New Code
                       // Remove leading and trailing slashes from current directory
                        const currentDirWithoutSlashes = req.body.path.replace(/^\/|\/$/g, "");

                        // Remove current directory from the beginning of the path
                        const regex = new RegExp(`^${currentDirWithoutSlashes}/`);
                        file.name = file.name.replace(regex, "");
                        const parts = file.name.split('/');
                        console.log(parts);

                      if (parts.length > 1) {
                          if (!commonFolders.includes(parts[0])){
                              commonFolders.push(parts[0]);
                              var cwd = {};
                              cwd.name = parts[0];
                              cwd.size = file.size;
                              cwd.isFile = false;
                              cwd.filterPath = req.body.path; 
                              cwd.dateModified = file.lastModified;
                              cwd.dateCreated = file.lastModified;
                              // cwd.type = path.extname(cwd.name);
                              cwd.hasChild = false;
                              files.push(cwd);
                              hasChild(parts[0]).then(function (data) {
                                hasChildPromise = hasChildPromise + 1;
                                var cwd = getCWDObjects();
                                cwd.name = parts[0];
                                files[files.findIndex(x => x.name == cwd.name)].hasChild = data;
                                if (hasChildPromise == array.length) {
                                    resolve(files);
                                }
                            })
                          }
                          return;
                      }
  
                      var cwd = {};
                      cwd.name = file.name;
                      cwd.size = file.size;
                      cwd.isFile = true;
                      cwd.filterPath = req.body.path;
                      cwd.dateModified = file.lastModified;
                      cwd.dateCreated = file.lastModified;
                      cwd.type = path.extname(cwd.name);
                      cwd.hasChild = false;
                      files.push(cwd);
                     });
                     console.log("This is the final form of ",files);
                    resolve(files);
                     if (dataArr.length == 0) {
                          resolve([]);
                      }
                  })
                // cos.listObjects({ Bucket: awsConfig.bucketName, Delimiter: "/", Prefix: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/"), Marker: "" + req.body.path.substr(1, req.body.path.length).replace("//", "/") }, function (err, data, array) {
                //     data.CommonPrefixes.forEach((file, index, array) => {
                //         var cwd = getCWDObjects();
                //         cwd.name = file.Prefix.replace(req.body.path.substr(1, req.body.path.length), "").replace("/", "");                      
                //         cwd.filterPath = req.body.path;
                //         cwd.hasChild = false;
                //         files.push(cwd);
                //         hasChild(file.Prefix).then(function (data) {
                //             hasChildPromise = hasChildPromise + 1;
                //             var cwd = getCWDObjects();
                //             cwd.name = file.Prefix.replace(req.body.path.substr(1, req.body.path.length), "").replace("/", "");
                //             files[files.findIndex(x => x.name == cwd.name)].hasChild = data;
                //             if (hasChildPromise == array.length) {
                //                 resolve(files);
                //             }
                //         })
                //     });
                //     data.Contents.forEach(file => {
                //         var cwd = {};
                //         cwd.name = file.Key.replace(req.body.path.substr(1, req.body.path.length), "");
                //         cwd.size = file.Size;
                //         cwd.isFile = true;
                //         cwd.dateModified = file.LastModified;
                //         cwd.filterPath = req.body.path;
                //         cwd.dateCreated = file.LastModified;
                //         cwd.type = path.extname(cwd.name);
                //         cwd.hasChild = false;
                //         files.push(cwd);
                //         resolve(files);
                //     });
                //     if (data.CommonPrefixes.length == 0 && data.Contents.length == 0) {
                //         resolve([]);
                //     }
                // });

            }
        });
    }

    if (req.body.action == "read") {
        var response, cwdFile = {};
        if (req.body.path != "/") {
            cwdFile = {
                name: req.body.data[0].name,
                size: 0,
                isFile: false,
                dateModified: req.body.data[0].dateCreated,
                dateCreated: req.body.data[0].dateModified,
                filterPath: req.body.path,
                type: ""
            };
            getFilesList(req).then(data => {
                console.log("This is the cwd File: ",cwdFile);
                response = {
                    cwd: cwdFile,
                    files: data
                };
                responseDetails(res, response);
            })

        } else {
            getFilesList(req).then(data => {
                cwdFile = {
                    name: awsConfig.bucketName,
                    size: 0,
                    isFile: false,
                    dateModified: new Date(),
                    dateCreated: new Date(),
                    type: "",
                    filterPath: req.body.path,
                };
                response = {
                    cwd: cwdFile,
                    files: data
                };
                responseDetails(res, response);
            })
        }
    }
});

/**
 * Server serving port
 */
 export default app;
// var runPort = process.env.PORT || 8090;
// var server = app.listen(runPort, function () {
//     server.setTimeout(10 * 60 * 1000);
//     var host = server.address().address;
//     var port = server.address().port;
//     console.log("Example app listening at http://%s:%s", host, port);
// });