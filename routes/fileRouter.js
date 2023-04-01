import express from 'express';
import multer from 'multer';
import { minioClient } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// define your routes
router.post('/upload',authMiddleware,upload.single('file'),async (req,res)=>{
    try{    
        console.log("Route is working");
        const file = req.file;
        const filename = `${Date.now()}-${file.originalname}`;
        console.log(file);
        await minioClient.putObject('test', filename, file.buffer, file.size);
        return res.status(200).send(`File ${filename} uploaded successfully!`);
    } catch(error){
        console.log(error);
    }
 
});
// export the router
export default router;
