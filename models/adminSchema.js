const {type}=require('express/lib/response')
const mongoose=require('mongoose')
const adminSchema=new mongoose.Schema({
    name:{
        type:String
    },
    email:{
        type:String
    },
    password:{
        type:String
    }
});
module.exports=mongoose.model('admins',adminSchema)