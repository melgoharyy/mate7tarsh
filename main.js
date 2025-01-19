const express = require('express')
const app = express()
const bcrypt = require('bcrypt');
app.use(express.json());
const mysql = require('mysql2');
const dotenv = require('dotenv');


dotenv.config();
app.use(express.json());


const connection = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
});


connection.getConnection((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }
    console.log('Connected to MySQL');
});

// User Apis

app.post('/login', async (req, res) => {
    try {
        const {email, password} = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }
        const [existingUser] = await connection.promise().query(
            `SELECT * FROM users WHERE email = ?`,
            [email]
        );
        const isPasswordMatch = await bcrypt.compare(password, existingUser[0].password);
        console.log(isPasswordMatch);
        const currentUser = existingUser[0];
        delete currentUser.password;
        if (isPasswordMatch) {
            res.status(200).json(currentUser);
        } else {
            res.status(404).json({
                message: "User not found"
            })
        }
    } catch (err) {
        console.log(err);
        res.status(400).json(
            { message: "email or password are not correct" },
        );
    }
})

app.post('/register', async (req, res) => {
    try {
        const { name,email, password} = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }
      
        const [existingUsers] = await connection.promise().query(
            `SELECT * FROM users WHERE email = ? `,
            [email]
        );

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            if (existingUser.email === email) {
                return res.status(400).json({ message: "Email is already taken" });
            }
           
        }

        const hashedPassword = await bcrypt.hash(password, Number(process.env.HASH_SALT_ROUNDS));

        const [{ insertId }] = await connection.promise().query(
            `INSERT INTO users (name,email,password) 
            VALUES (?,?,?)`,
            [name,email,hashedPassword]
        );

        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.log(error);
        res.status(400).json({ message: 'User registration failed' });
    }
});

app.put('/users/:id', async (req, res) => {
    try{
        const userId = req.params.id;
        const { age, favoriteFood, favoritePlaces, diseases } = req.body;
        
        if (age == null || typeof age !== "number" || age <= 0) {
            return res.status(400).json({ message: "Age is wrong" });
        }
        else if (!Array.isArray(favoritePlaces) || favoritePlaces.length === 0) {
            return res.status(400).json({ message: "Favorite places must be a non-empty." });
        }
        else if (!Array.isArray(favoriteFood) || favoriteFood.length === 0) {
            return res.status(400).json({ message: "Favorite food must be a non-empty." });
        }
        else if (!Array.isArray(diseases) || diseases.length === 0) {
            return res.status(400).json({ message: "Diseases must be a non-empty." });
        }
    
        await connection.promise().query(
            `update users set age = ? , favorite_places = ? , favorite_food = ? , diseases = ? where id =?`,
            [age,favoritePlaces?.join(","),favoriteFood?.join(","),diseases?.join(","),userId]
        );
        const [users] = await connection.promise().query(
        `SELECT * FROM users WHERE id = ?;`,
        [userId]
        );
        const user = users[0];
        delete user.password;
        console.log(user)
        res.status(201).json(user);

    } catch (err) {
        console.log(err);
        res.status(400).json({ message: "Update Information Failed" });
    }
});

// Restaurant Apis

app.post('/restaurants', async (req, res) => {
    try {
        const { name,latitude,longitude,street,city,cuisine} = req.body;
        if (!name || !latitude || !longitude || !street || !city || !cuisine) {
            return res.status(400).json({ message: "Name, latitude, longitude, street, city, cuisine are required fields"});
        }

        const [restaurants] = await connection.promise().query(
            `select * from restaurants where name = ?`,
            [name]
        );
        if (restaurants && restaurants.length > 0) {
            return res.status(400).json({ message: "Restaurant with same name already exists" });
        }

        const [cuisines] = await connection.promise().query(
            `select * from cuisines where name = ?`,
            [cuisine]
        );
        if(!cuisines || cuisines.length === 0) {
           return res.status(404).json({ message: "Cuisine not found" })
        }

        const [{insertId}] = await connection.promise().query(
            `INSERT INTO restaurants (name, latitude,longitude,street,city,cuisine_id) VALUES (?,?,?,?,?,?)`,
            [name, latitude,longitude,street,city,cuisines[0]?.id]
        );
        const [createdRestaurant] = await connection.promise().query(
            `select * from restaurants where id = ?`,
            [insertId]
        );

            res.status(201).json(createdRestaurant[0]);

    }catch (err) {
        console.error(err);
        res.status(400).json({ message: 'Failed to add restaurant' });
    } 
});

app.post('/items', async (req, res) => {
    try {
        const {name, price, image, restaurant} = req.body;
        const [restaurants] = await connection.promise().query(
            `select * from restaurants where name = ?`,
            [restaurant]
        );
        if (!restaurants || restaurants.length === 0) {
            return res.status(404).json({ message: "restaurant not found" });
        }

        const [{insertId}] = await connection.promise().query(
            `insert into menu_items (name, price, image, restaurant_id) values (?,?,?,?)`,
            [name, price, image, Number(restaurants[0]?.id)]
        );
        const [items] = await connection.promise().query(
            `select * from menu_items where id = ?`,
            [insertId]
        );
        if (items && items.length > 0) {
            res.status(201).json(items[0])
        } else {
            res.status(404).json({ message: "Menu Item not found"})
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: "Error while creating menu item"});
    }

})

app.post('/restaurants/:id/review', async (req, res) => {
    try{
        const {id} = req.params;
        const {comment, rating, userId} = req.body

        if (!id || !comment || !rating || !userId) {
            return res.status(400).json({ message: "id, comment, rating, userId are required"});
        }

        const [restaurants] = await connection.promise().query(
            `select * from restaurants where id = ?`,
            [id]
        );

        if (!restaurants || restaurants.length === 0) {
            return res.status(400).json({ message: "Restaurant not found" })
        }

        const [users] = await connection.promise().query(
            `select * from users where id = ?`,
            [userId]
        );

        if (!users || users.length === 0) {
            return res.status(400).json({ message: "User not found" })
        }

        const [{insertId}] = await connection.promise().query(
            `insert into reviews (comment,rating,user_id,restaurant_id) values (?,?,?,?)`,
            [comment,rating,userId,id]
        );

        const [reviews] = await connection.promise().query(
            `select * from reviews where id = ?`,
            [insertId]
        );

        if (reviews && reviews.length > 0) {
            res.status(201).json(reviews[0])
        } else {
            res.status(404).json({ message: "Review not found" })
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: "Error While submitting review"});
    }


})

app.get('/restaurants', async (req, res) => {
    try {
        const [restaurants] = await connection.promise().query(
            `select * from restaurants`
        );
        if (restaurants && restaurants.length > 0) {
            res.status(200).json(restaurants);
        } else {
            res.status(404).json({ message: "Restaurants not found "})
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: "Error while getting restaurants"});
    }
})

app.get('/restaurants/:id', async (req, res) => {
    try {
        const {id} = req.params;
        if (!id) {
            return res.status(400).json({ message: "restaurant id is required"});
        }

        const [restaurants] = await connection.promise().query(
            `select * from restaurants where id = ?`,
            [id]
        );
        if (!restaurants || restaurants.length === 0 ) {
            return res.status(404).json({ message: "Restaurant not found"})
        }

        const [items] = await connection.promise().query(
            `select * from menu_items where restaurant_id = ?`,
            [id]
        );

        const [reviews] = await connection.promise().query(
            `select * from reviews where restaurant_id = ?`,
            [id]
        );
        res.status(200).json({...restaurants[0], items: items, reviews: reviews});

    } catch (error) {
        console.log(error);
        res.status(400).json({ message: "Error while getting restaurant info"});
    }

})

// Search Api

app.get('/search', async (req, res) => {
    try{
        const {name} = req.query;
        const [restaurants] = await connection.promise().query(
            `select * from restaurants where name = ?`,
            [name]
        );
        if(restaurants && restaurants.length > 0) {
            res.status(200).json(restaurants[0]);
        } else {
            res.status(404).json({ message: "Restaurant Not Found" });
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({ message: "Error while searching for restaurant, please try again" });
    }

})



app.listen(5000)







