import os
import uuid
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from .models import db, User, AudioPost, Reaction

api_bp = Blueprint("api", __name__, url_prefix="/api")

ALLOWED_AUDIO_EXT = {"mp3", "wav", "webm", "ogg", "m4a"}
MAX_DURATION_SECONDS = 15
ALLOWED_EMOJIS = {"🔥", "❤️", "👏", "😂", "🤯"}


def allowed_audio(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_AUDIO_EXT


# ---------- MEHMON REJIMI: hech qanday login talab qilinmaydi ----------

@api_bp.route("/markers")
def get_markers():
    """3D globusda ko'rsatiladigan barcha aktiv nuqtalar (guest ham ko'ra oladi)"""
    posts = AudioPost.query.filter_by(is_active=True).all()
    return jsonify([p.to_map_marker() for p in posts])


@api_bp.route("/profile/<user_id>")
def get_public_profile(user_id):
    """Public Profile Card - nuqta bosilganda ochiladigan ma'lumot, login shart emas"""
    user = User.query.get_or_404(user_id)
    viewer_id = current_user.id if current_user.is_authenticated else None
    return jsonify(user.to_public_dict(viewer_id))


@api_bp.route("/audio/<post_id>/listen", methods=["POST"])
def register_listen(post_id):
    """Har audio eshitilganda hisoblagichni oshirish - guest ham qila oladi"""
    post = AudioPost.query.get_or_404(post_id)
    post.listens_count = (post.listens_count or 0) + 1
    post.author.total_listens = (post.author.total_listens or 0) + 1
    db.session.commit()
    return jsonify({"ok": True, "listens_count": post.listens_count})


@api_bp.route("/post/<post_id>")
def get_single_post(post_id):
    """Ulashish (share) linki ochilganda bitta postni ko'rsatish uchun - login shart emas"""
    post = AudioPost.query.filter_by(id=post_id, is_active=True).first_or_404()
    viewer_id = current_user.id if current_user.is_authenticated else None
    return jsonify(post.to_dict(viewer_id))


# ---------- REAKSIYALAR: ko'rish - guest ham, qo'yish - faqat login ----------

@api_bp.route("/audio/<post_id>/react", methods=["POST"])
@login_required
def react_to_post(post_id):
    """
    Postga reaksiya bosish. Bir foydalanuvchi bir postga faqat bitta emoji
    qo'ya oladi - qayta shu emojini bossa, reaksiya olib tashlanadi (toggle),
    boshqa emoji bossa, avvalgisi almashtiriladi.
    """
    post = AudioPost.query.get_or_404(post_id)
    data = request.get_json(force=True)
    emoji = data.get("emoji")

    if emoji not in ALLOWED_EMOJIS:
        return jsonify({"error": "Ruxsat etilmagan emoji"}), 400

    existing = Reaction.query.filter_by(post_id=post_id, user_id=current_user.id).first()

    if existing and existing.emoji == emoji:
        db.session.delete(existing)
        db.session.commit()
        return jsonify(post.to_dict(current_user.id))

    if existing:
        existing.emoji = emoji
    else:
        db.session.add(Reaction(post_id=post_id, user_id=current_user.id, emoji=emoji))

    db.session.commit()
    return jsonify(post.to_dict(current_user.id))


# ---------- FAOL HARAKAT: bu yerdan pastda login_required ----------

@api_bp.route("/profile", methods=["PUT"])
@login_required
def update_my_profile():
    """
    Profil to'ldirish qadami (audio joylashdan oldin bir marta):
    ism, bio, social_links va h.k.
    """
    data = request.get_json(force=True)

    username = data.get("username", "").strip()
    if username:
        existing = User.query.filter(
            User.username == username, User.id != current_user.id
        ).first()
        if existing:
            return jsonify({"error": "Bu username band"}), 400
        current_user.username = username

    current_user.bio = data.get("bio", current_user.bio)
    current_user.location_city = data.get("location_city", current_user.location_city)
    current_user.location_country = data.get("location_country", current_user.location_country)

    social_links = data.get("social_links")
    if isinstance(social_links, dict):
        allowed_keys = {"telegram", "github", "instagram", "portfolio"}
        current_user.social_links = {
            k: v for k, v in social_links.items() if k in allowed_keys and v
        }

    db.session.commit()
    return jsonify(current_user.to_public_dict())


@api_bp.route("/audio", methods=["POST"])
@login_required
def upload_audio():
    """
    Audio joylash: fayl (multipart/form-data) + lat/lng.
    Fayl Supabase Storage'ga yoki lokal /uploads papkaga saqlanadi.
    """
    if not current_user.is_profile_complete:
        return jsonify({"error": "profile_incomplete",
                         "message": "Avval bio va username to'ldiring"}), 400

    file = request.files.get("audio")
    lat = request.form.get("lat")
    lng = request.form.get("lng")
    duration = request.form.get("duration", type=int)

    if not file or not allowed_audio(file.filename):
        return jsonify({"error": "Noto'g'ri audio fayl"}), 400
    if not lat or not lng:
        return jsonify({"error": "Koordinata (lat/lng) kerak"}), 400
    if duration and duration > MAX_DURATION_SECONDS:
        return jsonify({"error": f"Audio {MAX_DURATION_SECONDS} soniyadan oshmasligi kerak"}), 400

    filename = f"{uuid.uuid4()}_{secure_filename(file.filename)}"

    # --- Variant A: lokal saqlash (dev uchun) ---
    upload_dir = os.path.join(current_app.root_path, "static", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)
    audio_url = f"/static/uploads/{filename}"

    # --- Variant B: Supabase Storage (prod uchun tavsiya etiladi) ---
    # audio_url = upload_to_supabase_storage(file, filename)

    post = AudioPost(
        user_id=current_user.id,
        post_type="audio",
        audio_url=audio_url,
        duration=duration,
        lat=float(lat),
        lng=float(lng),
    )
    db.session.add(post)
    db.session.commit()

    return jsonify(post.to_dict(current_user.id)), 201


@api_bp.route("/text-post", methods=["POST"])
@login_required
def create_text_post():
    """Matn bilan fikr qoldirish - audio o'rniga yoki qo'shimcha ravishda"""
    if not current_user.is_profile_complete:
        return jsonify({"error": "profile_incomplete",
                         "message": "Avval bio va username to'ldiring"}), 400

    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    lat = data.get("lat")
    lng = data.get("lng")

    if not text:
        return jsonify({"error": "Matn bo'sh bo'lmasligi kerak"}), 400
    if len(text) > 500:
        return jsonify({"error": "Matn 500 belgidan oshmasligi kerak"}), 400
    if lat is None or lng is None:
        return jsonify({"error": "Koordinata (lat/lng) kerak"}), 400

    post = AudioPost(
        user_id=current_user.id,
        post_type="text",
        text_content=text,
        lat=float(lat),
        lng=float(lng),
    )
    db.session.add(post)
    db.session.commit()

    return jsonify(post.to_dict(current_user.id)), 201


@api_bp.route("/audio/<post_id>", methods=["DELETE"])
@login_required
def delete_audio(post_id):
    """Shaxsiy kabinetdan aktiv audioni o'chirish"""
    post = AudioPost.query.get_or_404(post_id)
    if post.user_id != current_user.id:
        return jsonify({"error": "Ruxsat yo'q"}), 403
    post.is_active = False
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/my-posts")
@login_required
def my_posts():
    posts = current_user.audio_posts.order_by(AudioPost.created_at.desc()).all()
    return jsonify([p.to_dict(current_user.id) for p in posts])
