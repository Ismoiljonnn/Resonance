from flask import Blueprint, redirect, url_for, jsonify, current_app
from flask_login import login_user, logout_user, current_user
from authlib.integrations.flask_client import OAuth

from .models import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
oauth = OAuth()


def is_admin(user):
    admin_email = current_app.config.get("ADMIN_EMAIL", "")
    return bool(admin_email) and user.email == admin_email


def init_oauth(app):
    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


@auth_bp.route("/google/login")
def google_login():
    redirect_uri = url_for("auth.google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback")
def google_callback():
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo") or oauth.google.parse_id_token(token)

    google_sub = userinfo["sub"]
    email = userinfo.get("email")
    full_name = userinfo.get("name", "")
    avatar_url = userinfo.get("picture")

    user = User.query.filter_by(google_sub=google_sub).first()
    if user is None:
        # First-time login -> auto-register (email/full_name/avatar come from Google)
        user = User(
            google_sub=google_sub,
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
        )
        db.session.add(user)
        db.session.commit()
    else:
        # The avatar/name on Google can change — keep them in sync
        user.avatar_url = avatar_url
        user.full_name = full_name or user.full_name
        db.session.commit()

    login_user(user, remember=True)

    if user.is_profile_complete:
        return redirect(url_for("main.index"))
    return redirect(url_for("main.register_page"))


@auth_bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("main.index"))


@auth_bp.route("/me")
def me():
    """Lets the frontend check session state (logged in or not)"""
    if current_user.is_authenticated:
        return jsonify({
            "authenticated": True,
            "user": current_user.to_public_dict(),
            "profile_complete": current_user.is_profile_complete,
            "is_admin": is_admin(current_user),
        })
    return jsonify({"authenticated": False})