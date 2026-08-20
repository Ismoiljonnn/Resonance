from flask import Flask, render_template, request
from flask_login import LoginManager
from flask_migrate import Migrate
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .models import db, User
from .auth import auth_bp, init_oauth
from .api import api_bp

login_manager = LoginManager()
migrate = Migrate()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Render/Heroku kabi platformalar HTTPS trafikni ichkarida HTTP orqali
    # uzatadi (reverse proxy). Bu bo'lmasa, Google OAuth redirect_uri
    # noto'g'ri "http://" bilan generatsiya bo'lib, redirect_uri_mismatch
    # xatoligiga olib keladi.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    init_oauth(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(user_id)

    from flask import Blueprint
    main_bp = Blueprint("main", __name__)

    # Mehmon rejimida ham sahifa ochiladi - login shart emas
    @main_bp.route("/")
    def index():
        return render_template(
            "index.html",
            open_recorder=request.args.get("open_recorder"),
            lat=request.args.get("lat"),
            lng=request.args.get("lng"),
            open_post=None,
        )

    # Ulashish linki: /post/<id> - post avtomatik ochiladi
    @main_bp.route("/post/<post_id>")
    def view_post(post_id):
        return render_template(
            "index.html",
            open_recorder=None,
            lat=None,
            lng=None,
            open_post=post_id,
        )

    app.register_blueprint(main_bp)

    return app