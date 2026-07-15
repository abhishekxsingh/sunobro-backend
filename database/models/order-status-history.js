module.exports = (sequelize, DataTypes) => {
  const OrderStatusHistory = sequelize.define('OrderStatusHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    note: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'order_status_history',
    updatedAt: false,
  });

  OrderStatusHistory.associate = (db) => {
    OrderStatusHistory.belongsTo(db.Order, { foreignKey: 'orderId', as: 'order' });
  };

  return OrderStatusHistory;
};
