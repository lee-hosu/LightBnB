const properties = require('./json/properties.json');
const users = require('./json/users.json');

const { Pool } = require('pg');

// Configure database connection
const pool = new Pool({
  user: 'vagrant',
  password: '123',
  host: 'localhost',
  database: 'lightbnb',
});

/// Users

/**
 * Get a single user from the database given their email.
 * @param {String} email The email of the user.
 * @return {Promise<{}>} A promise to the user.
 */

const getUserWithEmail = function (email) {
  const queryString = `
  SELECT *
  FROM users
  WHERE email = $1;
  `;

  const values = [email.toLowerCase()];

  return pool
    .query(queryString, values)
    .then((result) => {
      if (result.rows.length > 0) {
        return result.rows[0];
      } else {
        return null;
      }
    })
    .catch((err) => {
      console.error('Error querying database:', err);
      return null;
    });
};

/**
 * Get a single user from the database given their id.
 * @param {string} id The id of the user.
 * @return {Promise<{}>} A promise to the user.
 */

const getUserWithId = function (id) {
  // Use a database query to fetch the user by id
  const queryString = `
    SELECT *
    FROM users
    WHERE id = $1;
  `;
  const values = [id];

  return pool
    .query(queryString, values)
    .then((result) => {
      if (result.rows.length > 0) {
        return result.rows[0]; // Return the user with the specified id
      } else {
        return null; // No user found with the given id
      }
    })
    .catch((err) => {
      console.error('Error querying database:', err);
      return null;
    });
};

/**
 * Add a new user to the database.
 * @param {{name: string, password: string, email: string}} user
 * @return {Promise<{}>} A promise to the user.
 */

const addUser = function (user) {
  // Use a database query to insert a new user
  const queryString = `
    INSERT INTO users (name, password, email)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const values = [user.name, user.password, user.email];

  return pool
    .query(queryString, values)
    .then((result) => {
      if (result.rows.length > 0) {
        return result.rows[0]; // Return the newly added user
      } else {
        return null; // Something went wrong during insertion
      }
    })
    .catch((err) => {
      console.error('Error querying database:', err);
      return null;
    });
};

/// Reservations

/**
 * Get all reservations for a single user.
 * @param {string} guest_id The id of the user.
 * @return {Promise<[{}]>} A promise to the reservations.
 */
const getAllReservations = function (guest_id, limit = 10) {
  const queryString = `
  SELECT properties.*, reservations.*, avg(rating) as average_rating
  FROM reservations
  JOIN properties ON reservations.property_id = properties.id
  JOIN property_reviews ON properties.id = property_reviews.property_id 
  WHERE reservations.guest_id = $1
  AND reservations.end_date < now()::date
  GROUP BY properties.id, reservations.id
  ORDER BY reservations.start_date
  LIMIT $2;
  `;

  const values = [guest_id, limit];
  return pool
    .query(queryString, values)
    .then((result) => {
      return result.rows;
    })
    .catch((err) => {
      console.error('Query error:', err);
      // return null;
    });
};

/// Properties

/**
 * Get all properties.
 * @param {{}} options An object containing query options.
 * @param {*} limit The number of results to return.
 * @return {Promise<[{}]>}  A promise to the properties.
 */

const getAllProperties = function (options, limit = 100) {
  // Setup an array to hold any parameters that may be available for the query
  const queryParams = [];

  // Start the query with all information that comes before the WHERE clause.
  let queryString = `
  SELECT properties.*, avg(property_reviews.rating) as average_rating
  FROM properties
  JOIN property_reviews ON properties.id = property_id
  `;

  // Check if a city, owner_id or price_per_night has been passed in as an option. Add them to the params array and create a WHERE clause
  if (options.city) {
    queryParams.push(`%${options.city}%`);
    queryString += `WHERE city iLIKE $${queryParams.length} `;
  }

  if (options.owner_id) {
    queryParams.push(`${options.owner_id}`);
    queryString += `WHERE owner_id = $${queryParams.length} `;
  }

  if (options.minimum_price_per_night && options.maximum_price_per_night) {
    if (queryParams.length === 0) {
      queryParams.push(`${options.minimum_price_per_night * 100}`);
      queryString += `WHERE cost_per_night BETWEEN $${queryParams.length} `;
      queryParams.push(`${options.maximum_price_per_night * 100}`);
      queryString += `AND $${queryParams.length} `;
    } else {
      queryParams.push(`${options.minimum_price_per_night * 100}`);
      queryString += `AND cost_per_night BETWEEN $${queryParams.length} `;
      queryParams.push(`${options.maximum_price_per_night * 100}`);
      queryString += `AND $${queryParams.length} `;
    }
  }

  if (options.minimum_price_per_night && !options.maximum_price_per_night) {
    if (queryParams.length === 0) {
      queryParams.push(`${options.minimum_price_per_night * 100}`);
      queryString += `WHERE cost_per_night >= $${queryParams.length} `;
    } else {
      queryParams.push(`${options.minimum_price_per_night * 100}`);
      queryString += `AND cost_per_night >= $${queryParams.length} `;
    }
  }

  if (!options.minimum_price_per_night && options.maximum_price_per_night) {
    if (queryParams.length === 0) {
      queryParams.push(`${options.maximum_price_per_night * 100}`);
      queryString += `WHERE cost_per_night <= $${queryParams.length} `;
    } else {
      queryParams.push(`${options.maximum_price_per_night * 100}`);
      queryString += `AND cost_per_night <= $${queryParams.length} `;
    }
  }

  queryString += `
  GROUP BY properties.id `;

  // Minimum Rating of Properties
  if (options.minimum_rating) {
    queryParams.push(`${options.minimum_rating}`);
    queryString += `HAVING avg(rating) >= $${queryParams.length} `;
  }

  //
  queryParams.push(limit);
  queryString += `
  ORDER BY cost_per_night
  LIMIT $${queryParams.length};
  `;

  // Console log everything just to make sure we've done it right.
  console.log(queryString, queryParams);

  // Run and return the query
  return pool.query(queryString, queryParams).then((result) => result.rows);
};

/**
 * Add a property to the database
 * @param {{}} property An object containing all of the property details.
 * @return {Promise<{}>} A promise to the property.
 */
const addProperty = function (property) {
  const queryParamProp = [
    'title',
    'description',
    'owner_id',
    'cover_photo_url',
    'thumbnail_photo_url',
    'cost_per_night',
    'parking_spaces',
    'number_of_bathrooms',
    'number_of_bedrooms',
    'province',
    'city',
    'country',
    'street',
    'post_code',
  ];

  const queryParams = [];

  for (prop of queryParamProp) {
    queryParams.push(property[prop]);
  }

  const queryString = `
  INSERT INTO properties (
    title, description, owner_id, cover_photo_url, thumbnail_photo_url, 
    cost_per_night, parking_spaces, number_of_bathrooms, number_of_bedrooms,
    province, city, country, street, post_code) 
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    ) RETURNING *;
  `;

  return pool
    .query(queryString, queryParams)
    .then((result) => {
      return result.rows[0];
    })
    .catch((err) => {
      console.log(err.message);
    });
};

module.exports = {
  getUserWithEmail,
  getUserWithId,
  addUser,
  getAllReservations,
  getAllProperties,
  addProperty,
};
