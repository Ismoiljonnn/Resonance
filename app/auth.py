from flask import Blueprint, redirect, url_for, session, request, jsonify, current_app
from flask_login import login_user, logout_user, current_user
from authlib.integrations.flask_client import OAuth

from .models import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
oauth = OAuth()


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
    """
    Lazy-auth trigger: the user is routed here when they click "Share a thought".
    We stash `intent` (and `pending_lat`/`pending_lng`, if any) in the session so
    the callback can send them back to exactly what they were doing.
    """
    intent = request.args.get("intent", "share_thought")
    session["pending_intent"] = intent

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

    # Send the user back to what they were doing (with the composer open)
    intent = session.pop("pending_intent", None)
    session.pop("pending_lat", None)
    session.pop("pending_lng", None)

    if intent == "share_thought":
        return redirect(url_for("main.index", open_recorder=1))

    return redirect(url_for("main.index"))


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
        })
    return jsonify({"authenticated": False})