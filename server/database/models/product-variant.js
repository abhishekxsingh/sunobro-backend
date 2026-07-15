module.exports = (sequelize, DataTypes) => {
  const ProductVariant = sequelize.define('ProductVariant', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    productId: { type: DataTypes.UUID, allowNull: false },
    size: { type: DataTypes.STRING, allowNull: false },
    color: { type: DataTypes.STRING, allowNull: false },
    sku: { type: DataTypes.STRING, allowNull: false, unique: true },
    stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    qikinkSku: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'product_variants',
  });

  ProductVariant.associate = (db) => {
    ProductVariant.belongsTo(db.Product, { foreignKey: 'productId', as: 'product' });
  };

  return ProductVariant;
};
