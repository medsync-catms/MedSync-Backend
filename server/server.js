const express = require('express');
const app = express();
const patientRouter = require('./routes/patients');
const authRouter = require('./routes/auth');

require('dotenv').config();
const port = process.env.PORT;

app.use('/patients', patientRouter);
app.use('/auth', authRouter);

app.get('/', (req, res) => {
    res.send('Home Page')
})

app.get('/dashboard', (req, res) => {
    res.send('Dashboard Page')
})

app.get('/admin', (req, res) => {
    res.send('Admin Page')
})

app.listen(port, () => {
    console.log(`server started at port ${port}`);
});