import createError from 'http-errors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import usersRouter from './routes/usersRouter.js';
import storageRouterBackup from './routes/storageRouterBackup.js';
import { minioClient} from "./db.js";
import cors from 'cors';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
  origin: process.env.URI
}))

app.use('/users', usersRouter);
app.use('/',storageRouterBackup);

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
  res.render('error')
});

export default app;
