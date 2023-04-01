import mongoose from 'mongoose';
import Minio from 'minio';
import * as dotenv from 'dotenv';
dotenv.config();


const URI = process.env.MONGO_URI;
const connectionParams = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
export const mongodb = ()=>{
  console.log("This code is running")
    try {
      mongoose.connect(URI,connectionParams)
      .then(()=>{
        console.log('Connection Successful');
      });
      mongoose.connection.on('connected', () => {
        console.log('Connected to MongoDB');
      });
    } catch (error){
      console.log(error);
    }
}
mongodb();

export const minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: process.env.MINIO_ACCESS,
    secretKey: process.env.MINIO_SECRET,
  });
