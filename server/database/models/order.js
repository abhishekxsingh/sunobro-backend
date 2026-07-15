module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reference: { type: DataTypes.STRING, allowNull: false, unique: true },
    customerId: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    shippingFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
    shippingFirstName: { type: DataTypes.STRING, allowNull: false },
    shippingLastName: { type: DataTypes.STRING, allowNull: false },
    shippingStreet: { type: DataTypes.STRING, allowNull: false },
    shippingCity: { type: DataTypes.STRING, allowNull: false },
    shippingPostalCode: { type: DataTypes.STRING, allowNull: false },
    shippingCountry: { type: DataTypes.STRING, allowNull: false },
    destination: { type: DataTypes.STRING, allowNull: true },
    estimatedArrival: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'orders',
  });

  Order.associate = (db) => {
    Order.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });
    Order.hasMany(db.OrderItem, { foreignKey: 'orderId', as: 'items' });
    Order.hasMany(db.OrderStatusHistory, { foreignKey: 'orderId', as: 'statusHistory' });
  };

  return Order;
};
