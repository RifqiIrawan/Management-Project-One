package router

import (
	"fmt"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/RifqiIrawan/Management-Project-One/backend/internal/config"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/handler"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/middleware"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/apperror"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/jwt"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/response"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/pkg/validator"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/repository"
	"github.com/RifqiIrawan/Management-Project-One/backend/internal/service"
)

func New(cfg *config.Config, db *gorm.DB) (*gin.Engine, error) {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	validator.Init()

	// repository → service → handler
	userRepo := repository.NewUserRepository(db)
	tokenRepo := repository.NewTokenRepository(db)
	jwtMgr := jwt.NewManager(cfg.JWTSecret, cfg.JWTIssuer, cfg.AccessTTL)

	authSvc, err := service.NewAuthService(userRepo, tokenRepo, jwtMgr, cfg)
	if err != nil {
		return nil, fmt.Errorf("auth service: %w", err)
	}
	userSvc := service.NewUserService(userRepo)
	authH := handler.NewAuthHandler(authSvc, cfg)
	userH := handler.NewUserHandler(userSvc)

	r := gin.New()
	_ = r.SetTrustedProxies(nil) // ClientIP = alamat koneksi asli (anti spoof X-Forwarded-For)
	r.Use(gin.Logger(), gin.Recovery(), middleware.Security())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	v1 := r.Group("/api/v1")
	v1.GET("/health", func(c *gin.Context) {
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			response.Err(c, apperror.New(http.StatusServiceUnavailable, "UNAVAILABLE", "Database tidak terjangkau"))
			return
		}
		response.OK(c, http.StatusOK, gin.H{"status": "ok", "env": cfg.AppEnv})
	})

	auth := v1.Group("/auth")
	auth.POST("/register", middleware.NewIPLimiter(5).Middleware(), authH.Register)
	auth.POST("/login", middleware.NewIPLimiter(5).Middleware(), authH.Login)
	auth.POST("/refresh", authH.Refresh)
	auth.POST("/logout", authH.Logout)

	private := v1.Group("", middleware.Auth(authSvc))
	private.POST("/auth/logout-all", authH.LogoutAll)
	private.GET("/me", userH.Me)
	private.PATCH("/me", userH.UpdateMe)
	private.PATCH("/me/password", authH.ChangePassword)

	return r, nil
}
