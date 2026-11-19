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
	projectRepo := repository.NewProjectRepository(db)
	memberRepo := repository.NewMemberRepository(db)
	userSvc := service.NewUserService(userRepo)
	projectSvc := service.NewProjectService(projectRepo, memberRepo)
	memberSvc := service.NewMemberService(projectRepo, memberRepo, userRepo)
	taskSvc := service.NewTaskService(projectRepo, repository.NewTaskRepository(db), memberRepo, cfg.Timezone)
	taskRepo := repository.NewTaskRepository(db)
	commentSvc := service.NewCommentService(taskRepo, repository.NewCommentRepository(db))
	activitySvc := service.NewActivityService(projectRepo, taskRepo, repository.NewActivityRepository(db))
	dashboardSvc := service.NewDashboardService(taskRepo, repository.NewActivityRepository(db), projectSvc, cfg.Timezone)
	dashboardH := handler.NewDashboardHandler(dashboardSvc)
	taskH := handler.NewTaskHandler(taskSvc)
	commentH := handler.NewCommentHandler(commentSvc)
	activityH := handler.NewActivityHandler(activitySvc)
	authH := handler.NewAuthHandler(authSvc, cfg)
	userH := handler.NewUserHandler(userSvc)
	projectH := handler.NewProjectHandler(projectSvc)
	memberH := handler.NewMemberHandler(memberSvc)

	r := gin.New()
	_ = r.SetTrustedProxies(nil) // ClientIP = alamat koneksi asli (anti spoof X-Forwarded-For)
	r.HandleMethodNotAllowed = true
	r.NoRoute(func(c *gin.Context) { response.Err(c, apperror.ErrNoRoute) })
	r.NoMethod(func(c *gin.Context) { response.Err(c, apperror.ErrNoMethod) })
	r.Use(gin.Logger(), middleware.Recovery(), middleware.Security())
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
	private.GET("/me/tasks", taskH.MyTasks)
	private.GET("/dashboard", dashboardH.Get)
	private.GET("/users/search", middleware.NewIPLimiter(30).Middleware(), userH.Search)

	projects := private.Group("/projects")
	projects.GET("", projectH.List)
	projects.POST("", projectH.Create)
	projects.GET("/:projectId", projectH.Get)
	projects.PATCH("/:projectId", projectH.Update)
	projects.DELETE("/:projectId", projectH.Delete)
	projects.POST("/:projectId/archive", projectH.Archive)
	projects.POST("/:projectId/favorite", projectH.ToggleFavorite)
	projects.GET("/:projectId/members", memberH.List)
	projects.POST("/:projectId/members", memberH.Add)
	projects.PATCH("/:projectId/members/:userId", memberH.UpdateRole)
	projects.DELETE("/:projectId/members/:userId", memberH.Remove)
	projects.GET("/:projectId/tasks", taskH.List)
	projects.POST("/:projectId/tasks", taskH.Create)
	projects.GET("/:projectId/activities", activityH.ListProject)

	tasks := private.Group("/tasks")
	tasks.GET("/:taskId", taskH.Get)
	tasks.PATCH("/:taskId", taskH.Update)
	tasks.PATCH("/:taskId/move", taskH.Move)
	tasks.DELETE("/:taskId", taskH.Delete)
	tasks.GET("/:taskId/comments", commentH.List)
	tasks.POST("/:taskId/comments", commentH.Create)
	tasks.GET("/:taskId/activities", activityH.ListTask)

	comments := private.Group("/comments")
	comments.PATCH("/:commentId", commentH.Update)
	comments.DELETE("/:commentId", commentH.Delete)

	return r, nil
}
