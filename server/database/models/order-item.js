module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define('OrderItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    size: { type: DataTypes.STRING, allowNull: false },
    color: { type: DataTypes.STRING, allowNull: false },
    sku: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'order_items',
  });

  OrderItem.associate = (db) => {
    OrderItem.belongsTo(db.Order, { foreignKey: 'orderId', as: 'order' });
    OrderItem.belongsTo(db.Product, { foreignKey: 'productId', as: 'product' });
  };

  return OrderItem;
};
