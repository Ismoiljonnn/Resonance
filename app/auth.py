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
    Lazy Auth trigger: foydalanuvchi 'Fikr qoldirish' tugmasini bosganda
    shu route'ga yo'naltiriladi. `intent` va `pending_lat`/`pending_lng` kabi
    parametrlarni session'da saqlab qo'yamiz, callback'dan keyin foydalanuvchi
    aynan to'xtagan joyiga qaytadi.
    """
    intent = request.args.get("intent", "record_audio")
    lat = request.args.get("lat")
    lng = request.args.get("lng")

    session["pending_intent"] = intent
    if lat and lng:
        session["pending_lat"] = lat
        session["pending_lng"] = lng

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
        # Birinchi marta kirish -> avtomatik ro'yxatdan o'tkazish (email/full_name/avatar Google'dan)
        user = User(
            google_sub=google_sub,
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
        )
        db.session.add(user)
        db.session.commit()
    else:
        # Har safar Google'dagi avatar/ism yangilanishi mumkin - sinxronlab turamiz
        user.avatar_url = avatar_url
        user.full_name = full_name or user.full_name
        db.session.commit()

    login_user(user, remember=True)

    # Foydalanuvchi to'xtagan joyiga qaytarish (audio yozish modali ochiq holda)
    intent = session.pop("pending_intent", None)
    lat = session.pop("pending_lat", None)
    lng = session.pop("pending_lng", None)

    if intent == "record_audio" and lat and lng:
        return redirect(url_for("main.index", open_recorder=1, lat=lat, lng=lng))

    return redirect(url_for("main.index"))


@auth_bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("main.index"))


@auth_bp.route("/me")
def me():
    """Frontend session holatini tekshirishi uchun (login bo'lganmi yo'qmi)"""
    if current_user.is_authenticated:
        return jsonify({
            "authenticated": True,
            "user": current_user.to_public_dict(),
            "profile_complete": current_user.is_profile_complete,
        })
    return jsonify({"authenticated": False})
