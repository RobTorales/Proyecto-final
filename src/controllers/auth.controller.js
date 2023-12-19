import AuthServices from "../services/auth.services.js";
import { userModel } from "../dao/models/user.model.js";
import CartServices from "../services/cart.services.js";
import { generateAuthenticationErrorInfo } from "../services/error/errorMessages/user.auth.error.js";
import CustomError from "../services/error/customeError.js";
import sendResetPasswordEmail from "./resetPassword.controller.js";
import { createHash, isValidPassword } from "../utils.js";

class AuthController {
    constructor (){
        this.AuthServices = new AuthServices();
        this.CartServices = new CartServices();
    }

    async login(req, res, next) {
      try {
        const { email, password } = req.body;
        const userData = await this.AuthServices.login(email, password);
        req.logger.info("User data retrieved:", userData);

        if (!userData || !userData.user) {
          req.logger.error("Invalid credentials");
          const customeError = new CustomError({
            name: "Auth Error",
            message: "Credenciales invalidas",
            code:401,
            cause: generateAuthenticationErrorInfo(email),
          });
          return next(customeError)
        }
  
        if (userData && userData.user) {
          req.session.user = {
            id: userData.user.id || userData.user._id,
            email: userData.user.email,
            first_name: userData.user.firstName || userData.user.first_name,
            last_name: userData.user.lastName || userData.user.last_name,
            age: userData.user.age,
            role: userData.user.role,
            cart: userData.user.cart,
          };
        }
  
        req.logger.info("Full user data object:", userData.user);
  
        res.cookie("robCookieToken", userData.token, {
          httpOnly: true,
          secure: false,
        });
        return res.status(200).json({
          status: "success",
          user: userData.user,
          redirect: "/products",
        });
      } catch (error) {
        req.logger.error("An error occurred:", error);
        return next(error);
      }
    }
   


    async githubCallback(req, res) {
      try {
        if (req.user) {
          req.session.user = req.user;
          req.session.loggedIn = true;
          return res.redirect("/products");
        } else {
          return res.redirect("/login");
        }
      } catch (error) {
        console.error("An error occurred:", error);
        return res.redirect("/login");
      }
    }
  
    logout(req, res) {
      req.session.destroy((err) => {
        if (err) {
          return res.redirect("/profile");
        }
        return res.redirect("/login");
      });
    }
  
    async restorePassword(req, res) {
      const { email } = req.body;
      try {
        await sendResetPasswordEmail(email);
        res.send(
          "Se ha enviado un enlace de restablecimiento de contraseña a tu correo electrónico."
        );
      } catch (error) {
        console.error("Error in sendResetPasswordEmail:", error);
        res
          .status(500)
          .send(
            "Hubo un error al procesar tu solicitud de restablecimiento de contraseña. " +
              error.message
          );
      }
    }
  
    async resetPassword(req, res) {
      const { token } = req.params;
      const { password, confirmPassword } = req.body;
  
      if (password !== confirmPassword) {
        return res.status(400).send("Las contraseñas no coinciden.");
      }
  
      try {
        const user = await userModel.findOne({
          resetPasswordToken: token,
          resetPasswordExpires: { $gt: Date.now() },
        });
  
        if (!user) {
          return res.status(400).json({
            message:
              "El token de restablecimiento de contraseña es inválido o ha expirado.",
            tokenExpired: true,
          });
        }
  
        const isSamePassword = isValidPassword(user, password);
  
        if (isSamePassword) {
          return res
            .status(400)
            .send(
              "La nueva contraseña debe ser diferente a la contraseña actual."
            );
        }
  
        user.password = createHash(password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
  
        await user.save();
  
        res.send("Tu contraseña ha sido actualizada con éxito.");
      } catch (error) {
        console.error("Error al resetear la contraseña:", error);
        res
          .status(500)
          .send(
            "Error interno del servidor al intentar actualizar la contraseña."
          );
      }
    }
  }

export default AuthController;