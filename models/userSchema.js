const {type}=require('express/lib/response')
const mongoose=require('mongoose')
const userSchema=new mongoose.Schema({
    name:{
        type:String
    },
    email:{
        type:String,
        unique:true
    },
    password:{
        type:String
    },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String,
    
});
module.exports=mongoose.model('users',userSchema)