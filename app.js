import createError from 'http-errors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import indexRouter from './routes/indexRouter.js';
import usersRouter from './routes/usersRouter.js';
import fileRouter from './routes/fileRouter.js';
import { minioClient} from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);



// minioClient.makeBucket('another-test-bucket', 'us-east-1', function(err, bucketName) {
//   if (err) return console.log('Error creating bucket:', err)
//   console.log('Bucket created successfully:', bucketName)
// })
console.log(await minioClient.listBuckets());
minioClient.listBuckets((err, buckets) => {
  console.log("You were here");
  if (err) throw err
  console.log('Buckets:', buckets)
}) 

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/file',fileRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

export default app;
