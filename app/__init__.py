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

    # Platforms like Render/Heroku terminate HTTPS and forward plain HTTP
    # internally (reverse proxy). Without this, the Google OAuth redirect_uri
    # gets generated with the wrong "http://" scheme, causing a
    # redirect_uri_mismatch error.
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

    # The page loads for guests too — login isn't required
    @main_bp.route("/")
    def index():
        return render_template("index.html")

    # Share link: /post/<id> — kept for URL compatibility
    @main_bp.route("/post/<post_id>")
    def view_post(post_id):
        return render_template("index.html")

    @main_bp.route("/admin")
    def admin_page():
        return render_template("admin.html")

    @main_bp.route("/<username>")
    def user_profile(username):
        return render_template("profile.html", username=username)

    app.register_blueprint(main_bp)

    with app.app_context():
        try:
            from sqlalchemy import text
            db.session.execute(text(
                "UPDATE users SET social_links = jsonb_set("
                "social_links, '{telegram}', "
                "to_jsonb(replace(social_links->>'telegram', '@', ''))"
                ") WHERE social_links->>'telegram' LIKE '%@%'"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

    return app