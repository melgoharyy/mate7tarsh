const express = require('express')
const app = express()
const router = express.Router();
const serverless = require("serverless-http");
const bcrypt = require('bcrypt');
app.use(express.json());
const mysql = require('mysql2');
const dotenv = require('dotenv');



dotenv.config();

const connection = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT
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

        const [users] = await connection.promise().query(
            `select * from users where id = ?`,
            [insertId]
        );
        const user = users[0];
        delete user.password;
        res.status(201).json(user);

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
        const { name,latitude,longitude,street,city,image,area,cuisine,allergens} = req.body;
        if (!name || !latitude || !longitude || !street || !city || !area || !image || !cuisine || !allergens) {
            return res.status(400).json({ message: "Name, latitude, longitude, street, area, city, image, allergens, cuisine are required fields"});
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
            `INSERT INTO restaurants (name, latitude,longitude,street,city,area,image,allergens,cuisine_id) VALUES (?,?,?,?,?,?,?,?,?)`,
            [name, latitude,longitude,street,city,area,image,allergens,cuisines[0]?.id]
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
//favourites api
app.post('/favorites', async (req, res) => {
    try {
        const { user_id, restaurant_id } = req.body;
        if (!user_id || !restaurant_id) {
            return res.status(400).json({ message: "user_id and restaurant_id are required" });
        }
        if (isNaN(user_id) || isNaN(restaurant_id)) {
            return res.status(400).json({ message: "Invalid user_id or restaurant_id format" });
        }
        const [restaurant] = await connection.promise().query(
            `SELECT * FROM restaurants WHERE id = ?`,
            [restaurant_id]
        );
        if (!restaurant || restaurant.length === 0) {
            return res.status(404).json({ message: "Restaurant not found" });
        }
        const [existingFavorite] = await connection.promise().query(
            `SELECT * FROM favorites WHERE user_id = ? AND restaurant_id = ?`,
            [user_id, restaurant_id]
        );
        if (existingFavorite && existingFavorite.length > 0) {
            return res.status(409).json({ message: "Restaurant is already in favorites" });
        }
        await connection.promise().query(
            `INSERT INTO favorites (user_id, restaurant_id) VALUES (?, ?)`,
            [user_id, restaurant_id]
        );

        res.status(201).json({ message: "Restaurant added to favorites" });
      
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error while adding to favorites" });
    }
});

app.get('/favorites', async (req, res) => {
    try {
        const { userId } = req.query;
        if (isNaN(userId)) {
            return res.status(400).json({ message: "userId is required and must be a number" })
        }
        const [users] = await connection.promise().query(
            `select * from users where id = ?`,
            [userId]
        );
        if (!users || users.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const [favoriteRestaurantIds] = await connection.promise().query(
            `select restaurant_id from favorites where user_id = ?;`,
            [userId]
        );

        if (!favoriteRestaurantIds || favoriteRestaurantIds.length === 0) {
            return res.status(404).json({ message: "No favorites found"});
        }
        const mappedFavoriteRestaurantIds = favoriteRestaurantIds.map(item => item.restaurant_id);
        const [restaurants] = await connection.promise().query(
            `select * from restaurants where id in (?)`,
            [mappedFavoriteRestaurantIds]
        );
        res.status(200).json(restaurants);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error while getting favorite restaurants"});
    }
})

router.get('/', async (req, res) => {
    res.status(200).json({ message: "Server is running" });
})

app.get('/recommend', async (req, res) => {
    const { userId } = req.query;
    if (isNaN(userId)) {
        return res.status(400).json({ message: "userId is required and must be a number" });
    }
    const { GoogleGenerativeAI } = require("@google/generative-ai");

    const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash"
    });

    const [users] = await connection.promise().query(
        `select * from users where id = ?`,
        [userId]
    );

    if (!users || users.length === 0) {
        return res.status(404).json({ message: "User not found" });
    }

    const [restaurants] = await connection.promise().query(
      `select restaurants.*, cuisines.name as cuisine from restaurants
       inner join cuisines on restaurants.cuisine_id = cuisines.id`
    );

    console.log(restaurants);

    if (!restaurants || restaurants.length === 0) {
        return res.status(404).json({ message: "Restaurants not found" });
    }

    const userPreferences = `
        - Location: ${users[0].favorite_places}
        - Cuisine: ${users[0].favorite_food}
        - Allergens: ${users[0].diseases}`;

    const formatRestaurants = (restaurants) => {
        return restaurants.map(restaurant => {
            const { name, area, cuisine, allergens } = restaurant;
            const allergensText = allergens.trim() ? allergens : 'None';
            return `${name} - ${area} - Cuisine: ${cuisine} - Allergens: ${allergensText}`;
        }).join('\n');
    };

    console.log(userPreferences);
    console.log(formatRestaurants(restaurants));


    const prompt = `
        The user wants restaurant recommendations based on the following preferences:
        ${userPreferences}
        Below is the list of restaurants. Select the ones that match all the user's preferences:
        ${formatRestaurants(restaurants)} 
        Return only the restaurant names that match the user's preferences in the following format:
        "Restaurant Name 1, Restaurant Name 2, Restaurant Name 3" 
        `;

    const result = await model.generateContent({
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        text: prompt,
                    }
                ],
            }
        ],
        generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.1,
        }
    });
    console.log(result.response.text());

    const restaurantNames = result.response.text();
    const arrayOfRestaurants = restaurantNames.trim().split(",").map(item => item.trim());
    console.log(arrayOfRestaurants);
    const [currentRestaurants] = await connection.promise().query(
      `select * from restaurants where name in (?)`,
      [arrayOfRestaurants]
    );
    res.status(200).json(currentRestaurants);
})

app.use("/.netlify/functions/main", router);
module.exports.handler = serverless(app);






