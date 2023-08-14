import express from 'express';
import multer from 'multer';
import { minioClient } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// define your routes
//Upload a file
router.post('/upload',authMiddleware,upload.single('file'),async (req,res)=>{
    console.log(req.user.userId);
    try{    
        const file = req.file;
        const filename = `${Date.now()}-${file.originalname}`;
        //Empty if no folder
        const folderName = req.body.folderName || '';
        console.log(folderName);
        const objectName = folderName ? `${folderName}/${filename}` : filename;
        minioClient.bucketExists(req.user.userId,(err,exists)=>{
            if(err){
                return console.log('Error occurred: ', err);
            }

            if (exists) {
                console.log('Bucket already exists:',objectName);
                console.log(req.user.userId);
                // Upload file to the existing bucket
                minioClient.putObject(req.user.userId, objectName, file.buffer, file.size, (err, data) => {
                    if (err) {
                        return console.log('Error occurred: ', err);
                    } else {
                        console.log('File uploaded successfully: ',data);
                        // res.statusCode = 200;
                        // return res.send(`File ${filename} uploaded successfully!`);
                        return res.status(200).send(`File ${filename} uploaded successfully!`);
                    }
                });
            } else {
                console.log("Bucket doesnt exist:",objectName);
                // Create a new bucket
                minioClient.makeBucket(req.user.userId, (err, data) => {
                    if (err) {
                        return console.log('Error occurred: ', err);
                    } else {
                        minioClient.putObject(req.user.userId, objectName, file.buffer, file.size, (err, data) => {
                            if (err) {
                                return console.log('Error occurred: ', err);
                            } else {
                                console.log('File uploaded successfully: ',data);
                                return res.status(200).send(`File ${filename} uploaded successfully!`);
                            }
                        });
                        return res.status(200).send(`File ${filename} uploaded successfully!`);
                    }
                });
            }
        });
    } catch(error){
        console.log(error);
        return res.status(500).send(`Error Occurred`);
    }
});
//Get All Files
router.get('/allFiles',authMiddleware, async (req,res)=>{
    const userId = req.user.userId;
    const bucketName = userId;
    console.log(bucketName);
        const metaData = [];
        minioClient.listObjects(bucketName, '', true)
          .on('data', obj => {
            console.log("Data incoming");
            metaData.push(obj);
          })
          .on('end', () => {
            console.log(metaData);
            res.status(200).send(metaData);
          })
          .on('error', err => {
            console.log(err);
          });
});
//Get a specific file
router.get('/:fileName',authMiddleware ,function(req, res) {
    const fileName = req.params.fileName;
    const bucketName = req.user.userId;
    const folderName = req.body.folderName || '';
    const objectName = folderName ? `${folderName}/${filename}` : filename;
    minioClient.statObject(bucketName, objectName, function(err, stat) {
      if (err) {
        console.log(err);
        return res.status(404).end();
      }
  
      // Get the object contents
      minioClient.getObject(bucketName, objectName, function(err, stream) {
        if (err) {
          console.log(err);
          return res.status(500).end();
        }
  
        // Set the response headers
        res.setHeader('Content-Type', stat.metaData['content-type']);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', 'attachment; filename=' + stat.name);
  
        // Stream the object contents to the response
        stream.pipe(res);
      });
    });
  });
//Get a specific file from a specific Folder
// router.get('/:fileName/folder/:folderName',authMiddleware ,function(req, res) {
//   const fileName = req.params.fileName;
//   const folderName = req.params.folderName || '';
//   const objectName = folderName ? `${folderName}/${fileName}` : fileName;
//   const bucketName = req.user.userId;
//   const file = req.file;
//   minioClient.statObject(bucketName, objectName, function(err, stat) {
//     if (err) {
//       console.log(err);
//       return res.status(404).end();
//     }

//     // Get the object contents
//     minioClient.getObject(bucketName, objectName, function(err, stream) {
//       if (err) {
//         console.log(err);
//         return res.status(500).end();
//       }

//       // Set the response headers
//       res.setHeader('Content-Type', stat.metaData['content-type']);
//       res.setHeader('Content-Length', stat.size);
//       res.setHeader('Content-Disposition', 'attachment; filename=' + stat.name);

//       // Stream the object contents to the response
//       stream.pipe(res);
//     });
//   });
// });


router.delete('/:filename', authMiddleware, function(req, res) {
    const bucketName = req.user.userId;
    const fileName = req.params.filename;
    const folderName = req.body.folderName || '';
    const objectName = folderName ? `${folderName}/${fileName}` : fileName;
    console.log(objectName);
    console.log(req.body);
    minioClient.removeObject(bucketName, objectName, function(err) {
      if (err) {
        console.log('Error removing object: ', err);
        res.status(500).send('Error removing object');
      } else {
        console.log('Object removed successfully');
        res.status(200).send('Object removed successfully');
      }
    });
});
// router.delete('/:fileName/folder/:folderName', authMiddleware, function(req, res) {
//   const bucketName = req.user.userId;
//   const fileName = req.params.fileName;
//   const folderName = req.params.folderName || '';
//   const objectName = folderName ? `${folderName}/${fileName}` : fileName;
//   minioClient.removeObject(bucketName, objectName, function(err) {
//     if (err) {
//       console.log('Error removing object: ', err);
//       res.status(500).send('Error removing object');
//     } else {
//       console.log('Object removed successfully');
//       res.status(200).send('Object removed successfully');
//     }
//   });
// });
  //Update a File
  router.put('/:fileName', authMiddleware, upload.single('file'), (req, res, next) => {
    const fileName = req.params.fileName;
    const userId = req.user.userId;
    const file = req.file;
    const folderName = req.body.folderName || '';
    const objectName = folderName ? `${folderName}/${fileName}` : fileName;
    // check if file with given fileName exists in bucket
    minioClient.statObject(userId, objectName, (err, stat) => {
      if (err) {
        // handle error if file does not exist
        return res.status(404).json({ error: 'File not found' });
      }
  
      // update file using fileName
      const metaData = { ...stat.metaData, ...req.body.metaData };
      minioClient.putObject(req.user.userId, objectName, file.buffer, file.size, (err, data) => {
        if (err) {
            return console.log('Error occurred: ', err);
        } else {
            console.log('File updated successfully: ',data);
            return res.status(200).send(`File ${fileName} updated successfully!`);
        }
    });
    });

    
  });
  
// export the router
export default router;
