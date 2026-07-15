module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
    images: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    sizes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    inStock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: {
      type: DataTypes.ENUM('active', 'draft'),
      allowNull: false,
      defaultValue: 'active',
    },
  }, {
    tableName: 'products',
  });

  Product.associate = (db) => {
    Product.hasMany(db.ProductVariant, { foreignKey: 'productId', as: 'variants' });
    Product.hasMany(db.OrderItem, { foreignKey: 'productId', as: 'orderItems' });
  };

  return Product;
};
