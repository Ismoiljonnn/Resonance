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
        return render_template(
            "index.html",
            open_recorder=request.args.get("open_recorder"),
            lat=request.args.get("lat"),
            lng=request.args.get("lng"),
            open_post=None,
        )

    # Share link: /post/<id> — opens that post automatically
    @main_bp.route("/post/<post_id>")
    def view_post(post_id):
        return render_template(
            "index.html",
            open_recorder=None,
            lat=None,
            lng=None,
            open_post=post_id,
        )

    @main_bp.route("/admin")
    def admin_page():
        return render_template("admin.html")

    app.register_blueprint(main_bp)

    with app.app_context():
        users = User.query.filter(User.social_links.isnot(None)).all()
        changed = False
        for u in users:
            sl = u.social_links or {}
            tg = sl.get("telegram", "")
            if not tg:
                continue
            clean = tg.replace("t.me/@", "t.me/").lstrip("@")
            if clean != tg:
                sl["telegram"] = clean
                u.social_links = sl
                changed = True
        if changed:
            db.session.commit()

    return app