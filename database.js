
var mysql = require('mysql2');
var connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'mysql',
    database: 'mate7tarsh',

});
connection.query('select * from user', function (err, rows, field) {
    if (!err) {
        console.log(rows);
    } else {
        console.log(err);
    }
})
connection.end();


